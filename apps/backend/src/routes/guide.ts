import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { z } from 'zod'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { isPlatformAdmin, canSeeAllActions } from '../lib/access'
import { fetchAll } from '../lib/http'
import {
  ActionFact, buildScreenGuide, GUIDE_SCREENS, GuideFacts, GuideScreen, ROLE_LABELS,
} from '../lib/guide'
import { noticeSection, searchNotice } from '../lib/notice'
import {
  ASK_SCHEMA_VERSION, askCorpus, askPlan, buildAskSystemPrompt, buildAskUserPrompt, buildFallbackAnswer,
  detectPersonalData, NOTICE_MODEL, validateAskResponse,
} from '../lib/guideAsk'
import { detectInjection, filterCorpusForInjection } from '../lib/aiGuard'
import { callProvider, getCircuitBreaker, getProvider, sha256 } from '../lib/aiProvider'
import { publishedDocumentsCorpus, quotaExceeded, QUOTA_TENANT_PER_DAY, QUOTA_USER_PER_HOUR } from './ai'
import { buildCoverage, loadMatrix } from './matrix'

/**
 * Guide « Que faire ici ? » (GET) et question libre « Comment faire… ? » (POST /ask).
 * Le guide est calculé côté serveur à partir des données réelles du tenant et des
 * permissions du rôle (role_permissions) : chaque fait n'est chargé que si le rôle a
 * le droit correspondant, et ne sort que sous forme de compteurs et de libellés.
 */
const router: ExpressRouter = Router()

/** Rôles qui exécutent les actions (miroir de la liste « Assigner à »). */
const EXECUTOR_ROLES = ['process_owner', 'operator', 'site_manager', 'department_manager']

/** Toutes les lignes (pagination par 1000) ; une erreur base LÈVE au lieu de passer pour « rien à faire ». */
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  return (await fetchAll<T>(build)).rows
}

async function permissionsOf(req: AuthedRequest): Promise<Set<string>> {
  if (isPlatformAdmin(req)) {
    const rows = await all<{ code: string }>((a, b) => supabaseAdmin.from('permissions').select('code').order('code').range(a, b))
    return new Set(rows.map((p) => p.code))
  }
  return req.permissions ?? new Set()
}

async function loadTeam(tenantId: string): Promise<NonNullable<GuideFacts['team']>> {
  const rows = await all<{ role: string; is_active: boolean | null }>((a, b) =>
    supabaseAdmin.from('user_profiles').select('role, is_active').eq('tenant_id', tenantId).order('id').range(a, b))
  const active = rows.filter((u) => u.is_active !== false)
  return {
    active: active.length,
    executors: active.filter((u) => EXECUTOR_ROLES.includes(u.role)).length,
    qualityManagers: active.filter((u) => u.role === 'quality_manager').length,
    internalAuditors: active.filter((u) => u.role === 'internal_auditor').length,
    suspended: rows.length - active.length,
  }
}

async function loadTenantActions(tenantId: string, userId: string): Promise<NonNullable<GuideFacts['tenantActions']>> {
  const [rows, mySubs] = await Promise.all([
    all<{ id: string; status: string; due_at: string | null; assigned_to: string | null; submitted_at: string | null }>((a, b) =>
      supabaseAdmin.from('actions').select('id, status, due_at, assigned_to, submitted_at').eq('tenant_id', tenantId).order('id').range(a, b)),
    // Séparation des tâches : une action soumise dont j'ai rempli une étape n'est pas « à valider » par moi.
    // Jointure côté base (pas de liste d'ids dans l'URL, qui déborde quand les actions soumises sont nombreuses).
    all<{ action_id: string }>((a, b) =>
      supabaseAdmin.from('step_submissions').select('action_id, actions!inner(status)')
        .eq('tenant_id', tenantId).eq('submitted_by', userId).eq('actions.status', 'submitted').order('id').range(a, b)),
  ])
  const mine = new Set(mySubs.map((s) => s.action_id))
  const toApprove = rows
    .filter((a) => a.status === 'submitted' && a.assigned_to !== userId && !mine.has(a.id))
    .sort((a, b) => String(a.submitted_at ?? '').localeCompare(String(b.submitted_at ?? '')))
  const now = Date.now()
  return {
    toApprove: toApprove.length,
    firstToApproveId: toApprove[0]?.id ?? null,
    overdue: rows.filter((a) => a.due_at && new Date(a.due_at).getTime() < now && !['approved', 'closed'].includes(a.status)).length,
  }
}

/** Calcule la prochaine étape obligatoire d'une action (rang 1-based parmi les étapes à saisir). */
async function actionFact(action: any, userId: string): Promise<ActionFact> {
  const [steps, subs] = await Promise.all([
    all<{ id: string; title: string; sequence: number | null; required: boolean; step_type: string }>((a, b) =>
      supabaseAdmin.from('workflow_steps').select('id, title, sequence, required, step_type').eq('action_id', action.action_def_id).order('id').range(a, b)),
    all<{ step_id: string; submitted_by: string | null }>((a, b) =>
      supabaseAdmin.from('step_submissions').select('step_id, submitted_by').eq('action_id', action.id).order('id').range(a, b)),
  ])
  const ordered = steps.filter((s) => s.step_type !== 'approval').sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
  const done = new Set(subs.map((s) => s.step_id))
  const nextIdx = ordered.findIndex((s) => s.required && !done.has(s.id))
  return {
    id: action.id,
    title: (action.workflow_actions as any)?.title ?? action.action_def_id,
    status: action.status,
    nextStepIndex: nextIdx >= 0 ? nextIdx + 1 : null,
    nextStepTitle: nextIdx >= 0 ? ordered[nextIdx]!.title : null,
    stepTotal: ordered.length,
    rejected: action.status === 'in_progress' && Boolean(action.reviewed_by) && Boolean(action.review_comment),
    reviewComment: action.status === 'in_progress' ? (action.review_comment ?? null) : null,
    viewerIsExecutor: action.assigned_to === userId || subs.some((s) => s.submitted_by === userId),
  }
}

async function loadMyActions(tenantId: string, userId: string): Promise<Pick<GuideFacts, 'myActions' | 'nextAction'>> {
  const rows = await all<any>((a, b) => supabaseAdmin
    .from('actions')
    .select('id, status, action_def_id, assigned_to, due_at, created_at, reviewed_by, review_comment, workflow_actions(title)')
    .eq('tenant_id', tenantId).eq('assigned_to', userId).order('id').range(a, b))
  const isRejected = (a: any) => a.status === 'in_progress' && a.reviewed_by && a.review_comment
  const count = (st: string) => rows.filter((a) => a.status === st).length
  // Priorité : action rejetée à corriger, puis en cours, puis assignée ; à priorité égale, l'échéance la plus proche
  const rank = (a: any) => (isRejected(a) ? 0 : a.status === 'in_progress' ? 1 : 2)
  const candidates = rows
    .filter((a) => ['assigned', 'in_progress'].includes(a.status))
    .sort((a, b) => rank(a) - rank(b)
      || String(a.due_at ?? '9999').localeCompare(String(b.due_at ?? '9999'))
      || String(a.created_at).localeCompare(String(b.created_at)))
  return {
    myActions: {
      assigned: count('assigned'),
      inProgress: count('in_progress'),
      rejected: rows.filter(isRejected).length,
      blocked: count('blocked'),
      submitted: count('submitted'),
    },
    nextAction: candidates[0] ? await actionFact(candidates[0], userId) : null,
  }
}

async function loadWorkflows(tenantId: string, userId: string): Promise<NonNullable<GuideFacts['workflows']>> {
  const rows = await all<{ status: string; tenant_id: string | null; created_by: string | null; updated_by: string | null }>((a, b) =>
    supabaseAdmin.from('workflow_definitions').select('status, tenant_id, created_by, updated_by')
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`).order('id').range(a, b))
  const own = rows.filter((w) => w.tenant_id === tenantId)
  return {
    published: rows.filter((w) => w.status === 'published').length,
    ownPublished: own.filter((w) => w.status === 'published').length,
    ownInProgress: own.filter((w) => w.status === 'draft' || w.status === 'in_review').length,
    toApprove: own.filter((w) => w.status === 'in_review' && w.created_by !== userId && w.updated_by !== userId).length,
    myDrafts: own.filter((w) => w.status === 'draft' && w.created_by === userId).length,
  }
}

async function loadDocuments(tenantId: string, userId: string): Promise<NonNullable<GuideFacts['documents']>> {
  const rows = await all<{ status: string; created_by: string | null; updated_by: string | null }>((a, b) =>
    supabaseAdmin.from('documents').select('status, created_by, updated_by').eq('tenant_id', tenantId).order('id').range(a, b))
  return {
    published: rows.filter((d) => d.status === 'published').length,
    toApprove: rows.filter((d) => d.status === 'in_review' && d.created_by !== userId && d.updated_by !== userId).length,
    myDrafts: rows.filter((d) => d.status === 'draft' && d.created_by === userId).length,
    myInReview: rows.filter((d) => d.status === 'in_review' && d.created_by === userId).length,
  }
}

async function loadNc(tenantId: string): Promise<NonNullable<GuideFacts['nc']>> {
  const [ncs, capas] = await Promise.all([
    all<{ id: string; status: string }>((a, b) =>
      supabaseAdmin.from('nonconformities').select('id, status').eq('tenant_id', tenantId).order('id').range(a, b)),
    all<{ nonconformity_id: string; status: string; due_date: string | null }>((a, b) =>
      supabaseAdmin.from('capas').select('nonconformity_id, status, due_date').eq('tenant_id', tenantId).order('id').range(a, b)),
  ])
  const withCapa = new Set(capas.map((c) => c.nonconformity_id))
  const open = ncs.filter((n) => n.status !== 'closed')
  const today = new Date().toISOString().slice(0, 10)
  return {
    open: open.length,
    withoutCapa: open.filter((n) => !withCapa.has(n.id)).length,
    capaOverdue: capas.filter((c) => c.status === 'open' && c.due_date && c.due_date < today).length,
  }
}

async function loadMatrixFacts(tenantId: string): Promise<NonNullable<GuideFacts['matrix']>> {
  const { lines } = await loadMatrix(tenantId)
  const reqs = lines.filter((l) => l.requirement_type === 'requirement')
  const { totals } = buildCoverage(lines)
  return {
    applicable: totals.applicable,
    blocking: totals.blocking_gaps,
    toReview: reqs.filter((l) => l.assessment?.applicability === 'to_review').length,
    naPending: reqs.filter((l) => l.assessment?.applicability === 'not_applicable' && l.blocking).length,
  }
}

async function loadAudits(tenantId: string, userId: string): Promise<NonNullable<GuideFacts['audits']>> {
  const [audits, findings] = await Promise.all([
    all<{ id: string; status: string; auditor_id: string }>((a, b) =>
      supabaseAdmin.from('internal_audits').select('id, status, auditor_id').eq('tenant_id', tenantId).order('id').range(a, b)),
    all<{ audit_id: string; status: string; process_owner_id: string | null; responded_by: string | null }>((a, b) =>
      supabaseAdmin.from('audit_findings').select('audit_id, status, process_owner_id, responded_by').eq('tenant_id', tenantId).order('id').range(a, b)),
  ])
  const mine = audits.filter((a) => a.auditor_id === userId)
  const myInProgress = mine.filter((a) => a.status === 'in_progress')
  const unresolved = new Set(findings.filter((f) => ['open', 'responded', 'reopened'].includes(f.status)).map((f) => f.audit_id))
  const myAuditIds = new Set(mine.map((a) => a.id))
  return {
    open: audits.filter((a) => a.status !== 'closed').length,
    toStart: mine.filter((a) => a.status === 'planned').length,
    inProgress: myInProgress.length,
    toVerify: findings.filter((f) => myAuditIds.has(f.audit_id) && f.status === 'responded' && f.responded_by !== userId).length,
    closable: myInProgress.filter((a) => !unresolved.has(a.id)).length,
    toRespond: findings.filter((f) => f.process_owner_id === userId && ['open', 'reopened'].includes(f.status)).length,
  }
}

async function loadReviews(tenantId: string): Promise<NonNullable<GuideFacts['reviews']>> {
  const rows = await all<{ status: string; inputs: Record<string, unknown> | null; held_at: string | null }>((a, b) =>
    supabaseAdmin.from('management_reviews').select('status, inputs, held_at').eq('tenant_id', tenantId).order('id').range(a, b))
  const drafts = rows.filter((r) => r.status === 'draft')
  const held = rows.map((r) => r.held_at).filter(Boolean).sort() as string[]
  return {
    drafts: drafts.length,
    draftsWithoutInputs: drafts.filter((r) => !r.inputs || Object.keys(r.inputs).length === 0).length,
    lastHeldAt: held[held.length - 1] ?? null,
  }
}

async function loadActionDetail(req: AuthedRequest, actionId: string): Promise<ActionFact | null> {
  const { data: action, error } = await supabaseAdmin
    .from('actions')
    .select('id, status, action_def_id, assigned_to, reviewed_by, review_comment, workflow_actions(title)')
    .eq('tenant_id', req.user!.tenant_id!).eq('id', actionId).maybeSingle()
  if (error) throw new Error(error.message)
  // Même visibilité que GET /actions/:id : un exécutant ne voit que ses actions
  if (!action || (!canSeeAllActions(req) && action.assigned_to !== req.user!.id)) return null
  return actionFact(action, req.user!.id)
}

/** Charge uniquement les faits utiles à l'écran ET autorisés par le rôle. */
export async function loadFacts(req: AuthedRequest, screen: GuideScreen, actionId: string | null): Promise<GuideFacts> {
  const tenantId = req.user!.tenant_id!
  const userId = req.user!.id
  const permissions = await permissionsOf(req)
  const has = (p: string) => permissions.has(p)
  const f: GuideFacts = { role: req.user!.role ?? '', permissions }
  const jobs: Promise<unknown>[] = []
  const want = (cond: boolean, job: () => Promise<void>) => { if (cond) jobs.push(job()) }

  const onDash = screen === 'dashboard'
  const onList = screen === 'workflow'
  want((onDash || screen === 'users' || onList) && (has('user.manage') || has('action.assign')), async () => { f.team = await loadTeam(tenantId) })
  want((onDash || onList || screen === 'workflows') && (has('workflow.read') || has('action.assign')), async () => { f.workflows = await loadWorkflows(tenantId, userId) })
  want((onDash || onList || screen === 'reports') && (has('action.approve') || has('action.assign')), async () => { f.tenantActions = await loadTenantActions(tenantId, userId) })
  want((onDash || onList) && has('action.execute'), async () => { Object.assign(f, await loadMyActions(tenantId, userId)) })
  want((onDash || screen === 'audits') && (has('internal_audit.manage') || has('internal_audit.respond')), async () => { f.audits = await loadAudits(tenantId, userId) })
  want(['dashboard', 'nc', 'audit', 'reports'].includes(screen) && has('action.read'), async () => { f.nc = await loadNc(tenantId) })
  want(['matrice', 'audit'].includes(screen) && has('workflow.read'), async () => { f.matrix = await loadMatrixFacts(tenantId) })
  want(screen === 'documents' && has('document.read'), async () => { f.documents = await loadDocuments(tenantId, userId) })
  want(screen === 'reviews' && has('management_review.manage'), async () => { f.reviews = await loadReviews(tenantId) })
  want(screen === 'action' && Boolean(actionId) && has('action.read'), async () => { f.action = await loadActionDetail(req, actionId!) })
  await Promise.all(jobs)
  return f
}

const guideQuery = z.object({
  screen: z.enum(GUIDE_SCREENS),
  actionId: z.string().uuid().optional(),
})

// Tout utilisateur rattaché à un tenant (tenant.read est accordée à tous les rôles de tenant)
router.get('/', requireAuth, requireTenant, requirePermission('tenant.read'), async (req: AuthedRequest, res) => {
  const parsed = guideQuery.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'écran inconnu', code: 'ERR_INVALID_INPUT', details: parsed.error.flatten() })
  try {
    const facts = await loadFacts(req, parsed.data.screen, parsed.data.actionId ?? null)
    const guide = buildScreenGuide(parsed.data.screen, facts)
    res.json({
      guide,
      role_label: ROLE_LABELS[facts.role] ?? facts.role,
      manual: guide.manual.map((id) => ({ id, title: noticeSection(id)?.title ?? id, text: noticeSection(id)?.text ?? '' })),
    })
  } catch (e: any) {
    console.error('[guide]', e?.message ?? e)
    res.status(500).json({ error: 'guide indisponible', code: 'ERR_INTERNAL' })
  }
})

const askInput = z.object({
  screen: z.enum(GUIDE_SCREENS),
  actionId: z.string().uuid().optional(),
  question: z.string().trim().min(3, 'question trop courte').max(500, 'question trop longue (500 caractères max.)'),
})

router.post('/ask', requireAuth, requireTenant, requirePermission('tenant.read'), async (req: AuthedRequest, res) => {
  const parsed = askInput.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'question invalide', code: 'ERR_INVALID_INPUT', details: parsed.error.flatten() })
  const { screen, actionId, question } = parsed.data
  const tenantId = req.user!.tenant_id!
  const userId = req.user!.id

  // Données personnelles : refusées avant tout traitement — rien n'est envoyé ni stocké
  const personal = detectPersonalData(question)
  if (personal) {
    return res.status(400).json({
      error: `Retirez la donnée personnelle de votre question (${personal}) : l'assistant n'en a jamais besoin.`,
      code: 'ERR_AI_PERSONAL_DATA',
    })
  }

  const inputHash = sha256(`${screen}|${question}`)
  // R8 : la question est une DONNÉE — une tentative d'injection est rejetée et journalisée
  const scan = detectInjection(question)
  if (scan.injected) {
    const { error: logErr } = await supabaseAdmin.from('ai_interventions').insert({
      tenant_id: tenantId,
      user_id: userId,
      prompt_text: '(rejetée avant envoi — injection détectée)',
      context: {},
      response: {},
      status: 'rejected',
      result_status: 'rejected_injection',
      input_hash: inputHash,
      ai_meta: { kind: 'guide.ask', screen, matched: scan.matched },
    })
    if (logErr) console.error('[guide.ask] journal injection impossible:', logErr.message)
    return res.status(400).json({ error: 'instruction non autorisée détectée dans la question (R8) — requête journalisée', code: 'ERR_AI_INJECTION' })
  }

  let facts: GuideFacts
  try {
    facts = await loadFacts(req, screen, actionId ?? null)
  } catch (e: any) {
    console.error('[guide.ask]', e?.message ?? e)
    return res.status(500).json({ error: 'guide indisponible', code: 'ERR_INTERNAL' })
  }
  const guide = buildScreenGuide(screen, facts)
  const roleLabel = ROLE_LABELS[facts.role] ?? facts.role

  // Corpus : sections de la notice pertinentes (recherche + sections de l'écran) et documents publiés non confidentiels
  const found = searchNotice(question, screen, 3)
  const sections = [...found, ...guide.manual.map((id) => noticeSection(id)).filter((s) => s !== undefined)]
    .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i)
    .slice(0, 5)
  const { safe: docs, flagged } = filterCorpusForInjection(await publishedDocumentsCorpus(tenantId, 3))
  const corpus = askCorpus(sections, docs)
  const validIds = new Set(corpus.map((c) => c.id))

  // Quota : uniquement si un fournisseur est configuré ; atteint → réponse de la notice, pas de refus
  const providerConfigured = getProvider().http
  const plan = askPlan(
    providerConfigured,
    providerConfigured ? await quotaExceeded(tenantId, userId) : null,
    { user: QUOTA_USER_PER_HOUR, tenant: QUOTA_TENANT_PER_DAY },
  )

  const startedAt = Date.now()
  const called = plan.callAi
    ? await callProvider({
      system: buildAskSystemPrompt(),
      user: buildAskUserPrompt(question, guide, roleLabel, corpus),
      schemaHint: ASK_SCHEMA_VERSION,
    })
    : null

  let answer = buildFallbackAnswer(found, guide)
  let degraded = true
  let resultStatus: 'ok' | 'degraded' | 'unavailable' | 'error' = 'unavailable'
  // Un appel tenté puis échoué compte dans le quota (il a coûté) ; une réponse notice sans appel, non
  let model = plan.callAi ? 'provider-failed' : NOTICE_MODEL
  let latencyMs = Date.now() - startedAt
  const warnings: string[] = plan.warning ? [plan.warning] : []
  let removedSources: string[] = []

  if (!plan.callAi) {
    if (!providerConfigured) warnings.push('Aucun fournisseur IA configuré — réponse tirée de la notice d’utilisation.')
    else resultStatus = 'degraded'
  } else if (called?.http) {
    model = called.result.model
    latencyMs = called.result.latencyMs
    let raw: unknown = null
    try { raw = JSON.parse(called.result.text) } catch { /* traité ci-dessous */ }
    const outcome = validateAskResponse(raw, validIds)
    if (outcome.ok) {
      answer = outcome.value
      removedSources = outcome.removedSources
      degraded = false
      resultStatus = 'ok'
      if (removedSources.length) warnings.push(`${removedSources.length} source(s) inconnue(s) retirée(s) (R3).`)
    } else {
      resultStatus = 'error'
      warnings.push('Réponse de l’assistant non conforme — extraits de la notice affichés à la place (R6).')
    }
  } else {
    resultStatus = getCircuitBreaker().isOpen ? 'degraded' : 'error'
    warnings.push('Assistant IA indisponible — réponse tirée de la notice d’utilisation (R6).')
  }
  if (flagged.length) warnings.push(`${flagged.length} document(s) exclu(s) du contexte : instruction suspecte dans l'extrait (R8).`)

  const titles = new Map(corpus.map((c) => [c.id, c.title]))
  const sources = answer.source_ids.map((id) => ({ id, title: titles.get(id) ?? id, kind: id.startsWith('notice:') ? 'notice' : 'document' }))
  const response = { ...answer, sources, warnings, requires_human_review: true }

  // R5 : journal (append-only). La question n'est pas stockée en clair : empreinte + longueur seulement.
  const { data: intervention, error: logErr } = await supabaseAdmin
    .from('ai_interventions')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      prompt_text: JSON.stringify({ kind: 'guide.ask', screen, question_chars: question.length }),
      context: {},
      response,
      micro_steps: answer.steps,
      sources,
      status: 'draft',
      model,
      input_hash: inputHash,
      output_hash: sha256(JSON.stringify(response)),
      latency_ms: latencyMs,
      result_status: resultStatus,
      degraded,
      ai_meta: {
        kind: 'guide.ask',
        schema: ASK_SCHEMA_VERSION,
        screen,
        mode: plan.callAi ? 'provider' : 'notice',
        warnings,
        removed_sources: removedSources,
        excluded_documents: flagged,
      },
    })
    .select('id')
    .single()
  if (logErr) console.error('[guide.ask] journal R5 impossible:', logErr.message)

  res.json({ ...response, approved: false, degraded, model, latencyMs, interventionId: intervention?.id ?? null })
})

export const guideRouter: ExpressRouter = router
