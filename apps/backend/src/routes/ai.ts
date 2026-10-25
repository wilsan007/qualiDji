import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { z } from 'zod'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import {
  applyRulesAndValidate, buildSystemPrompt, buildTemplateGuidance, buildUserPrompt,
  confidenceToNumeric, CorpusSource, detectInjection, filterCorpusForInjection,
  renderPromptTemplate, sanitizeContext, StepLike,
} from '../lib/aiGuard'
import { callProvider, getCircuitBreaker, sha256 } from '../lib/aiProvider'
import { dbFail } from '../lib/http'

/**
 * §7 Assistant IA — pipeline obligatoire (§7.3) et règles R1-R10 (§7.5).
 * L'IA explique des étapes EXISTANTES d'un workflow publié : elle ne décide
 * rien, n'ajoute aucune étape, n'invente aucun seuil et n'approuve jamais
 * (suggestions = contenu non approuvé, validation humaine requise).
 */
const router: ExpressRouter = Router()

const guidanceInput = z.object({
  actionId: z.string().min(1),
  stepId: z.string().min(1).optional(),
  context: z.record(z.string(), z.any()).default({}),
})

/** Classifications autorisées à quitter la base vers le fournisseur IA (H2) : ni confidentiel, ni secret. */
const AI_ALLOWED_CLASSIFICATIONS = ['public', 'internal']

/** RAG (§7.6) : corpus = documents PUBLIÉS du tenant (filtrés serveur, R7) +
 * référentiel global (requirements liés à la clause). Seuls les documents
 * publiés, effectifs et NON confidentiels entrent — jamais d autre tenant, jamais de brouillon. */
async function buildCorpus(tenantId: string, clause: string | null): Promise<CorpusSource[]> {
  const { data: docs } = await supabaseAdmin
    .from('documents')
    .select('id, doc_key, title, excerpt, version, effective_from')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .in('classification', AI_ALLOWED_CLASSIFICATIONS)
    .order('effective_from', { ascending: false })
    .limit(5)
  const docSources: CorpusSource[] = (docs ?? [])
    .filter((d) => !d.effective_from || new Date(d.effective_from) <= new Date())
    .map((d) => ({
      object_type: 'document',
      object_id: d.id,
      title: `${d.title} (v${d.version}, ${d.doc_key})`,
      excerpt: (d.excerpt ?? '').slice(0, 400),
      version: d.version,
    }))

  const { data } = await supabaseAdmin
    .from('requirements')
    .select('id, clause, title, source_ref')
    .limit(30)
  const rows = (data ?? []).filter((r) =>
    clause ? String(r.clause ?? '').startsWith(clause.split('.')[0] ?? '') : true
  )
  const reqSources: CorpusSource[] = rows.slice(0, 5).map((r) => ({
    object_type: 'control',
    object_id: r.id,
    title: r.title ?? r.id,
    excerpt: r.source_ref ?? '',
    version: 1,
  }))
  return [...docSources, ...reqSources]
}

/** H7 — quotas (comptés en base : valables multi-instances et après redémarrage). */
const QUOTA_USER_PER_HOUR = Number(process.env.AI_QUOTA_USER_PER_HOUR ?? 30)
const QUOTA_TENANT_PER_DAY = Number(process.env.AI_QUOTA_TENANT_PER_DAY ?? 500)

/**
 * Verdict de quota (pur, testé unitairement) : le quota UTILISATEUR (heure)
 * prime sur le quota TENANT (jour) — on renvoie la limite la plus contraignante
 * atteinte pour adapter Retry-After et le message.
 */
export function quotaVerdict(byUser: number, byTenant: number, userLimit = QUOTA_USER_PER_HOUR, tenantLimit = QUOTA_TENANT_PER_DAY): 'user' | 'tenant' | null {
  if (byUser >= userLimit) return 'user'
  if (byTenant >= tenantLimit) return 'tenant'
  return null
}

async function quotaExceeded(tenantId: string, userId: string): Promise<'user' | 'tenant' | null> {
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const [byUser, byTenant] = await Promise.all([
    supabaseAdmin.from('ai_interventions').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('user_id', userId).gte('created_at', hourAgo),
    supabaseAdmin.from('ai_interventions').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('created_at', dayAgo),
  ])
  return quotaVerdict(byUser.count ?? 0, byTenant.count ?? 0)
}

router.post(
  '/guidance',
  requireAuth,
  requireTenant,
  requirePermission('action.execute'),
  async (req: AuthedRequest, res) => {
    const parsed = guidanceInput.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() })
    const { actionId, stepId, context } = parsed.data
    const tenantId = req.user!.tenant_id!
    const userId = req.user!.id

    // ── Quota par utilisateur (heure) et par tenant (jour) — avant tout travail ───
    const exceeded = await quotaExceeded(tenantId, userId)
    if (exceeded) {
      res.setHeader('Retry-After', exceeded === 'user' ? '3600' : '86400')
      return res.status(429).json({
        error: exceeded === 'user'
          ? `quota IA atteint (${QUOTA_USER_PER_HOUR} demandes par heure et par utilisateur)`
          : `quota IA du tenant atteint (${QUOTA_TENANT_PER_DAY} demandes par jour)`,
        code: 'ERR_AI_QUOTA',
      })
    }

    // ── §7.3.1 : accès à l'action — uniquement les workflows PUBLIÉS ────────
    const { data: action } = await supabaseAdmin
      .from('workflow_actions')
      .select('*, workflow_definitions(*), workflow_steps(*)')
      .eq('id', actionId)
      .single()
    const wdef = action?.workflow_definitions as any
    // workflow publié ET visible du tenant (global ou propre) — jamais celui d'un autre tenant
    if (!action || wdef?.status !== 'published' || (wdef.tenant_id != null && wdef.tenant_id !== tenantId)) {
      return res.status(404).json({ error: 'action not found (workflow non publié)' })
    }
    const steps: StepLike[] = ((action.workflow_steps as any[]) ?? [])
      .sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map((s) => ({
        id: s.id,
        title: s.title,
        instruction: s.instruction,
        step_type: s.step_type,
        validation_rule: s.validation_rule,
        guardrails: s.guardrails,
      }))
    if (stepId && !steps.some((s) => s.id === stepId)) {
      return res.status(404).json({ error: 'step not found in this action' })
    }

    // ── R8 : le contexte utilisateur est une DONNÉE non fiable ──────────────
    const contextText = JSON.stringify(context ?? {})
    const scan = detectInjection(contextText)
    if (scan.injected) {
      const { error: logErr } = await supabaseAdmin.from('ai_interventions').insert({
        tenant_id: tenantId,
        user_id: userId,
        action_def_id: actionId,
        step_id: stepId ?? null,
        prompt_text: '(rejetée avant envoi — injection détectée)',
        context: {},
        response: {},
        status: 'rejected',
        result_status: 'rejected_injection',
        input_hash: sha256(contextText),
        ai_meta: { matched: scan.matched },
      })
      if (logErr) console.error('[ai] journal injection impossible:', logErr.message)
      return res.status(400).json({
        error: 'instruction non autorisée détectée dans le contexte (R8) — requête journalisée',
        code: 'ERR_AI_INJECTION',
      })
    }

    // ── §7.3.2-3 : contexte minimal + corpus (R7 : filtré serveur) ─────────
    const wf = action.workflow_definitions as any
    const rawCorpus = await buildCorpus(tenantId, wf?.standard_clause ?? null)
    // R8 : un extrait de document contenant une instruction est exclu du prompt (donnée non fiable)
    const { safe: corpus, flagged } = filterCorpusForInjection(rawCorpus)
    const validSourceIds = new Set<string>([
      ...corpus.map((c) => c.object_id),
      ...steps.map((s) => s.id),
    ])
    const allowedStepIds = new Set(steps.map((s) => s.id))
    const { clean: userContext, dropped: droppedContext } = sanitizeContext(context)

    // R5 : gabarits de prompt des étapes (ai_prompt_templates) — version = empreinte de tous les gabarits utilisés
    const stepRows = ((action.workflow_steps as any[]) ?? []).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    const templateIds = Array.from(new Set(stepRows.map((s) => s.ai_prompt_template).filter(Boolean))) as string[]
    const templates = new Map<string, string>()
    if (templateIds.length) {
      const { data: tpls } = await supabaseAdmin.from('ai_prompt_templates').select('id, template').in('id', templateIds)
      for (const t of tpls ?? []) templates.set(t.id, t.template)
    }
    const templateId = templateIds.find((id) => templates.has(id)) ?? null
    const promptVersion = templates.size
      ? sha256([...templates.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, t]) => `${id}:${sha256(t)}`).join('|')).slice(0, 12)
      : null
    const stepPrompts: Record<string, string> = {}
    for (const s of stepRows) {
      const tpl = s.ai_prompt_template ? templates.get(s.ai_prompt_template) : undefined
      if (tpl) {
        stepPrompts[s.id] = renderPromptTemplate(tpl, {
          ...userContext,
          action_title: action.title ?? actionId,
          action_objective: action.objective ?? '',
          step_title: s.title,
          assigned_role: action.assigned_role ?? '',
        })
      }
    }

    // ── §7.3.4 : appel fournisseur via interface abstraite (§7.7) ──────────
    const inputHash = sha256(contextText + actionId + (stepId ?? ''))
    const startedAt = Date.now()
    const called = await callProvider({
      system: buildSystemPrompt(),
      user: buildUserPrompt(actionId, action.title, steps, corpus, { userContext, stepPrompts }),
      schemaHint: 'aiResponseContract/1.0',
    })

    let degraded = false
    let resultStatus: 'ok' | 'degraded' | 'unavailable' | 'error' = 'ok'
    let model = 'template-fallback'
    let latencyMs = Date.now() - startedAt
    const scopedSteps = stepId ? steps.filter((s) => s.id === stepId) : steps
    let aiResponse = buildTemplateGuidance(actionId, scopedSteps, corpus)
    const ruleWarnings: string[] = []
    let rejectedSteps: string[] = []
    let schemaOk = true

    if (called?.http) {
      model = called.result.model
      latencyMs = called.result.latencyMs
      try {
        const raw = JSON.parse(called.result.text)
        const outcome = applyRulesAndValidate(raw, { allowedStepIds, validSourceIds })
        if (outcome.ok) {
          // Suggestions = contenu NON APPROUVÉ ; R10 : aucune action automatique
          aiResponse = { ...outcome.value, action_id: actionId, step_id: stepId ?? null }
          ruleWarnings.push(...outcome.value.warnings)
          rejectedSteps = outcome.rejected
        } else {
          rejectedSteps = outcome.rejected
          schemaOk = false
          degraded = true
          resultStatus = 'error'
          ruleWarnings.push(`Réponse fournisseur rejetée (${outcome.error}) — mode standard activé (R6).`)
        }
      } catch {
        schemaOk = false
        degraded = true
        resultStatus = 'error'
        ruleWarnings.push('Réponse fournisseur illisible — mode standard activé (R6).')
      }
    } else if (called && !called.http) {
      // Aucun fournisseur configuré : le guidage vient du gabarit déterministe. Ce n'est PAS un succès de l'IA —
      // le journal le dit (unavailable / degraded) au lieu d'un « ok » trompeur.
      degraded = true
      resultStatus = 'unavailable'
      ruleWarnings.push('Aucun fournisseur IA configuré — guidage par gabarit déterministe (R6).')
    } else if (getCircuitBreaker().isOpen) {
      degraded = true
      resultStatus = 'degraded'
      ruleWarnings.push('Fournisseur IA indisponible (circuit ouvert) — mode standard activé (R6).')
    } else {
      degraded = true
      resultStatus = 'error'
      ruleWarnings.push('Appel au fournisseur IA en échec — mode standard activé (R6).')
    }
    if (flagged.length) {
      ruleWarnings.push(`${flagged.length} document(s) exclu(s) du contexte : instruction suspecte dans l'extrait (R8).`)
    }

    aiResponse.warnings = [...(aiResponse.warnings ?? []), ...ruleWarnings]
    aiResponse.requires_human_review = true
    const outputHash = sha256(JSON.stringify(aiResponse))

    // ── R5 : journal d'interaction (modèle, hashes, latence, résultat) ─────
    const { data: intervention, error: logErr } = await supabaseAdmin
      .from('ai_interventions')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        action_def_id: actionId,
        step_id: stepId ?? null,
        prompt_template_id: templateId,
        prompt_text: JSON.stringify({ actionId, stepId, context: Object.keys(context ?? {}) }),
        context: {},
        response: aiResponse,
        micro_steps: aiResponse.guidance,
        sources: aiResponse.guidance.flatMap((g) => g.source_refs),
        confidence: confidenceToNumeric(aiResponse.confidence_label),
        status: 'draft',
        model,
        prompt_version: promptVersion,
        input_hash: inputHash,
        output_hash: outputHash,
        latency_ms: latencyMs,
        result_status: resultStatus,
        degraded,
        ai_meta: {
          schema_ok: schemaOk,
          warnings: aiResponse.warnings,
          rejected_steps: rejectedSteps,
          provider: model,
          mode: called?.http ? 'provider' : 'template',
          context_keys: Object.keys(userContext),
          context_dropped: droppedContext,
          excluded_documents: flagged,
        },
      })
      .select('id')
      .single()
    if (logErr) console.error('[ai] journal R5 impossible:', logErr.message)

    // §7.3.9-10 : suggestions NON APPROUVÉES + mode standard si échec
    res.json({
      ...aiResponse,
      approved: false,
      degraded,
      model,
      latencyMs,
      interventionId: intervention?.id ?? null,
    })
  }
)

// ── R5 : traçabilité — journal des interactions (audit.export) ──────────────
router.get('/interventions', requireAuth, requireTenant, requirePermission('audit.export'), async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from('ai_interventions')
    .select('id, action_def_id, step_id, model, prompt_version, latency_ms, result_status, degraded, status, created_at, ai_meta')
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return dbFail(res, error, 'ai.interventions', 500)
  res.json({ interventions: data ?? [] })
})

export const aiRouter: ExpressRouter = router


