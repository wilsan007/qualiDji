import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { notifyByRoles, notifyUsers } from '../lib/notify'
import { isSupportedGuardrail, isSupportedValidationRule } from '../lib/stepValidation'

/**
 * Module B — Bibliothèque de workflows (V5 §5.2 / §6.1 / §6.3).
 * Cycle : brouillon → revue (submit) → approbation (approve/reject) → publication.
 * Un workflow publié n'est jamais édité directement : toute modification passe
 * par duplicate (nouvelle version + change_reason), comme exigé §5.2.
 * Bibliothèque partagée (pas de tenant_id) — écritures via service_role
 * uniquement, contrôlées par requirePermission (RBAC V5 §3.3).
 */
const router: ExpressRouter = Router()

/**
 * Isolation (C5) : la bibliothèque comporte des workflows GLOBAUX (tenant_id null, seed,
 * lecture seule pour les tenants) et des workflows PROPRES au tenant. Un tenant ne voit
 * jamais — et ne modifie jamais — les workflows d'un autre tenant.
 */
const tenantPrefix = (tenantId: string) => tenantId.replace(/-/g, '').slice(0, 8)
/** Code interne d'un workflow du tenant : unique par tenant, sans collision entre tenants. */
const ownId = (base: string, tenantId: string) => `${base}__${tenantPrefix(tenantId)}`
/** Retire le suffixe tenant et la version d'un identifiant pour en retrouver la racine. */
const baseCode = (id: string) => id.replace(/__[0-9a-f]{8}$/, '').replace(/_V\d+$/, '')
/** Filtre PostgREST : globaux + propres au tenant. */
const scope = (tenantId: string) => `tenant_id.is.null,tenant_id.eq.${tenantId}`

const STEP_TYPES = [
  'instruction', 'text_input', 'number_input', 'choice', 'checkbox', 'date',
  'signature', 'photo', 'file_upload', 'barcode', 'qr_scan', 'sensor_value',
  'location_check', 'confirmation', 'knowledge_question', 'approval',
] as const

const FREQUENCIES = ['annual', 'event_based', 'continuous'] as const

const stepInput = z.object({
  sequence: z.number().int().positive().max(999),
  title: z.string().min(1).max(200),
  instruction: z.string().min(1).max(4000),
  step_type: z.enum(STEP_TYPES),
  required: z.boolean().default(true),
  validation_rule: z.string().max(200).nullable().optional(),
  evidence_requirement: z.string().max(100).default('auto_save'),
  approver_role: z.string().max(100).nullable().optional(),
  segregation_of_duties: z.boolean().default(false),
  ai_guidance_enabled: z.boolean().default(true),
  ai_prompt_template: z.string().max(200).nullable().optional(),
  guardrails: z.array(z.any()).default([]),
  choices: z.array(z.any()).nullable().optional(),
}).superRefine((s, ctx) => {
  // Le serveur applique ces règles à l'exécution : une règle qu'il ne sait pas évaluer
  // ne doit jamais être publiée (elle serait ignorée ou bloquerait toute saisie).
  if (s.validation_rule && !isSupportedValidationRule(s.validation_rule)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['validation_rule'],
      message: 'règle non supportée — formats : min_length:N, max_length:N, min:N, max:N',
    })
  }
  s.guardrails.forEach((g, i) => {
    if (!isSupportedGuardrail(g, s.step_type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['guardrails', i],
        message: "garde-fou non supporté — seul { condition: \"choice == 'x'\", action: \"require_justification\", min_length?: N } sur une étape 'choice'",
      })
    }
  })
  if (s.step_type === 'choice' && !(s.choices && s.choices.length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['choices'], message: "une étape 'choice' exige une liste de choix" })
  }
})

const actionInput = z.object({
  title: z.string().min(1).max(200),
  objective: z.string().min(1).max(2000),
  assigned_role: z.string().min(1).max(100),
  sort_order: z.number().int().min(0).default(0),
  steps: z.array(stepInput).min(1).max(50),
})

const workflowInput = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/, 'code attendu : MAJUSCULES, chiffres, _').optional(),
  name: z.string().min(3).max(200),
  standard_clause: z.string().min(1).max(50),
  owner_role: z.string().min(1).max(100).default('quality_manager'),
  frequency: z.enum(FREQUENCIES).default('event_based'),
  actions: z.array(actionInput).min(1).max(20),
})

const reasonInput = z.object({ change_reason: z.string().min(5).max(1000) })
const rejectInput = z.object({ comment: z.string().min(3).max(1000) })

function canSeeDrafts(req: AuthedRequest): boolean {
  const role = req.user?.role ?? ''
  if (role === 'super_admin' || role === 'technical_admin') return true
  return req.permissions?.has('workflow.approve') ?? false
}

function audit(req: AuthedRequest, action: string, entityId: string, payload: Record<string, unknown> = {}) {
  const user = req.user
  if (!user?.tenant_id) return
  void supabaseAdmin.from('audit_log').insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action,
    entity: 'workflow_definition',
    entity_id: entityId,
    payload,
  })
}

/** Charge une définition + ses actions/étapes, avec la règle de visibilité des brouillons. */
async function loadWorkflow(id: string, req: AuthedRequest, res: any) {
  const { data: wf, error } = await supabaseAdmin
    .from('workflow_definitions')
    .select('*')
    .eq('id', id)
    .or(scope(req.user!.tenant_id!))
    .maybeSingle()
  if (error || !wf) {
    res.status(404).json({ error: 'workflow not found' })
    return null
  }
  // Un global non publié n'est visible d'aucun tenant ; un brouillon propre exige workflow.approve.
  if (wf.status !== 'published' && (wf.tenant_id === null || !canSeeDrafts(req))) {
    if (wf.tenant_id === null) {
      res.status(404).json({ error: 'workflow not found' })
      return null
    }
    res.status(403).json({ error: 'missing permission: workflow.approve', code: 'ERR_PERMISSION_DENIED' })
    return null
  }
  const { data: actions } = await supabaseAdmin
    .from('workflow_actions')
    .select('*')
    .eq('workflow_id', id)
    .order('sort_order')
  const actionRows = actions ?? []
  const { data: steps } = await supabaseAdmin
    .from('workflow_steps')
    .select('*')
    .in('action_id', actionRows.map((a) => a.id))
    .order('sequence')
  const stepsByAction = new Map<string, any[]>()
  for (const s of steps ?? []) {
    const list = stepsByAction.get(s.action_id) ?? []
    list.push(s)
    stepsByAction.set(s.action_id, list)
  }
  return {
    workflow: wf,
    actions: actionRows.map((a) => ({ ...a, steps: stepsByAction.get(a.id) ?? [] })),
  }
}

/** Workflow MODIFIABLE : propre au tenant. Global → 403 (lecture seule) ; autre tenant / inconnu → 404. */
async function loadOwnWorkflow(id: string, req: AuthedRequest, res: any) {
  const { data: wf } = await supabaseAdmin
    .from('workflow_definitions')
    .select('*')
    .eq('id', id)
    .or(scope(req.user!.tenant_id!))
    .maybeSingle()
  if (!wf || (wf.tenant_id === null && wf.status !== 'published')) {
    res.status(404).json({ error: 'workflow not found' })
    return null
  }
  if (wf.tenant_id === null) {
    res.status(403).json({
      error: 'bibliothèque globale en lecture seule — dupliquez le workflow dans votre tenant (POST /workflows/:id/duplicate)',
      code: 'ERR_WORKFLOW_GLOBAL_READONLY',
    })
    return null
  }
  return wf
}

// ── Liste de la bibliothèque ────────────────────────────────────────────────
// workflow.read suffit pour la bibliothèque publiée ; brouillons/obsolètes
// exigent workflow.approve (?include_all=1).
router.get('/', requireAuth, requireTenant, requirePermission('workflow.read'), async (req: AuthedRequest, res) => {
  const includeAll = req.query.include_all === '1'
  if (includeAll && !canSeeDrafts(req)) {
    return res.status(403).json({ error: 'missing permission: workflow.approve', code: 'ERR_PERMISSION_DENIED' })
  }
  const tid = req.user!.tenant_id!
  let query = supabaseAdmin
    .from('workflow_definitions')
    .select('*')
    .order('name')
  // Globaux publiés + workflows du tenant (published par défaut, tous statuts avec include_all)
  query = includeAll
    ? query.or(`and(tenant_id.is.null,status.eq.published),tenant_id.eq.${tid}`)
    : query.eq('status', 'published').or(scope(tid))
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ workflows: data ?? [] })
})

// ── Détail (actions + étapes) ───────────────────────────────────────────────
router.get('/:id', requireAuth, requireTenant, requirePermission('workflow.read'), async (req: AuthedRequest, res) => {
  const detail = await loadWorkflow(req.params.id, req, res)
  if (!detail) return
  res.json(detail)
})

// ── Insertion des actions/étapes d'un workflow (création & duplication) ─────
async function insertChildren(code: string, actions: z.infer<typeof actionInput>[]): Promise<string | null> {
  for (let ai = 0; ai < actions.length; ai++) {
    const a = actions[ai]
    const actionId = `${code}__A${ai + 1}`
    const { error: aErr } = await supabaseAdmin.from('workflow_actions').insert({
      id: actionId,
      workflow_id: code,
      title: a.title,
      objective: a.objective,
      assigned_role: a.assigned_role,
      sort_order: a.sort_order || ai + 1,
    })
    if (aErr) return aErr.message
    const { error: sErr } = await supabaseAdmin.from('workflow_steps').insert(
      a.steps.map((s, si) => ({
        id: `${actionId}__S${si + 1}`,
        action_id: actionId,
        sequence: s.sequence,
        title: s.title,
        instruction: s.instruction,
        step_type: s.step_type,
        required: s.required,
        validation_rule: s.validation_rule ?? null,
        evidence_requirement: s.evidence_requirement,
        approver_role: s.approver_role ?? null,
        segregation_of_duties: s.segregation_of_duties,
        ai_guidance_enabled: s.ai_guidance_enabled,
        ai_prompt_template: s.ai_prompt_template ?? null,
        guardrails: s.guardrails,
        choices: s.choices ?? null,
      }))
    )
    if (sErr) return sErr.message
  }
  return null
}

// ── Création d'un brouillon ─────────────────────────────────────────────────
router.post('/', requireAuth, requireTenant, requirePermission('workflow.create'), async (req: AuthedRequest, res) => {
  const parsed = workflowInput.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid workflow payload', details: parsed.error.flatten() })
  }
  const input = parsed.data
  const tenantId = req.user!.tenant_id!
  const code = ownId(input.code ?? `WF_${randomBytes(4).toString('hex').toUpperCase()}`, tenantId)

  const { data: existing } = await supabaseAdmin
    .from('workflow_definitions')
    .select('id')
    .eq('id', code)
    .maybeSingle()
  if (existing) return res.status(409).json({ error: `workflow code already exists: ${code}` })

  const { error: wfErr } = await supabaseAdmin.from('workflow_definitions').insert({
    id: code,
    tenant_id: tenantId,
    name: input.name,
    standard_clause: input.standard_clause,
    version: 1,
    owner_role: input.owner_role,
    frequency: input.frequency,
    is_active: false,
    status: 'draft',
    created_by: req.user?.id ?? null,
    updated_at: new Date().toISOString(),
  })
  if (wfErr) return res.status(400).json({ error: wfErr.message })

  const childErr = await insertChildren(code, input.actions)
  if (childErr) {
    await supabaseAdmin.from('workflow_definitions').delete().eq('id', code)
    return res.status(400).json({ error: childErr })
  }

  audit(req, 'workflow.create', code, { name: input.name, actions: input.actions.length })
  const detail = await loadWorkflow(code, req, res)
  if (detail) res.status(201).json(detail)
})

// ── Édition d'un brouillon (uniquement draft, §5.2) ─────────────────────────
router.put('/:id', requireAuth, requireTenant, requirePermission('workflow.edit_draft'), async (req: AuthedRequest, res) => {
  const parsed = workflowInput.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid workflow payload', details: parsed.error.flatten() })
  }
  const input = parsed.data
  const wf = await loadOwnWorkflow(req.params.id, req, res)
  if (!wf) return
  if (wf.status !== 'draft') {
    return res.status(409).json({ error: "workflow is not editable — dupliquez-le pour créer une nouvelle version (V5 §5.2)" })
  }

  const { error: updErr } = await supabaseAdmin
    .from('workflow_definitions')
    .update({
      name: input.name,
      standard_clause: input.standard_clause,
      owner_role: input.owner_role,
      frequency: input.frequency,
      updated_by: req.user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', wf.id)
  if (updErr) return res.status(400).json({ error: updErr.message })

  // Remplacement intégral des actions/étapes (un draft n'a jamais d'instances)
  const { data: oldActs } = await supabaseAdmin.from('workflow_actions').select('id').eq('workflow_id', wf.id)
  const oldActionIds = (oldActs ?? []).map((a) => a.id)
  if (oldActionIds.length) await supabaseAdmin.from('workflow_steps').delete().in('action_id', oldActionIds)
  const { error: delErr } = await supabaseAdmin.from('workflow_actions').delete().eq('workflow_id', wf.id)
  if (delErr) return res.status(400).json({ error: delErr.message })

  const childErr = await insertChildren(wf.id, input.actions)
  if (childErr) return res.status(400).json({ error: childErr })

  audit(req, 'workflow.update_draft', wf.id, { name: input.name })
  const detail = await loadWorkflow(wf.id, req, res)
  if (detail) res.json(detail)
})

// ── Soumission en revue : draft → in_review ─────────────────────────────────
router.post('/:id/submit', requireAuth, requireTenant, requirePermission('workflow.edit_draft'), async (req: AuthedRequest, res) => {
  const wf = await loadOwnWorkflow(req.params.id, req, res)
  if (!wf) return
  if (wf.status !== 'draft') return res.status(409).json({ error: `cannot submit: status is ${wf.status}` })

  const { count } = await supabaseAdmin
    .from('workflow_actions')
    .select('id', { count: 'exact', head: true })
    .eq('workflow_id', wf.id)
  if (!count) return res.status(409).json({ error: 'workflow has no actions — impossible à soumettre' })

  const { error } = await supabaseAdmin
    .from('workflow_definitions')
    .update({ status: 'in_review', updated_at: new Date().toISOString(), updated_by: req.user?.id ?? null })
    .eq('id', wf.id)
  if (error) return res.status(400).json({ error: error.message })
  audit(req, 'workflow.submit', wf.id)
  // Module G : revue requise — prévient les admins du tenant (§5.7)
  void notifyByRoles(['tenant_admin'], {
    tenantId: req.user!.tenant_id!,
    kind: 'workflow.in_review',
    dedupeKey: `workflow.submit:${wf.id}:v${wf.version}`,
    title: `Workflow à approuver : ${wf.name}`,
    body: 'Soumis en revue',
    link: '/workflows',
    entity: 'workflow_definition',
    entityId: wf.id,
    excludeUserIds: [req.user?.id],
  })
  res.json({ workflow: { ...wf, status: 'in_review' } })
})

// ── Approbation : in_review → published ─────────────────────────────────────
router.post('/:id/approve', requireAuth, requireTenant, requirePermission('workflow.approve'), async (req: AuthedRequest, res) => {
  const wf = await loadOwnWorkflow(req.params.id, req, res)
  if (!wf) return
  if (wf.status !== 'in_review') return res.status(409).json({ error: `cannot approve: status is ${wf.status}` })

  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from('workflow_definitions')
    .update({
      status: 'published',
      is_active: true,
      approved_by: req.user?.id ?? null,
      approved_at: now,
      effective_from: now,
      updated_at: now,
      updated_by: req.user?.id ?? null,
    })
    .eq('id', wf.id)
  if (error) return res.status(400).json({ error: error.message })
  audit(req, 'workflow.approve', wf.id)
  // Module G : publication — prévient le créateur (§5.7)
  void notifyUsers([wf.created_by], {
    tenantId: req.user!.tenant_id!,
    kind: 'workflow.approved',
    dedupeKey: `workflow.approved:${wf.id}:v${wf.version}`,
    title: `Workflow publié : ${wf.name}`,
    link: '/workflows',
    entity: 'workflow_definition',
    entityId: wf.id,
    excludeUserIds: [req.user?.id],
  })
  res.json({ workflow: { ...wf, status: 'published', is_active: true } })
})

// ── Rejet : in_review → draft (motif obligatoire) ───────────────────────────
router.post('/:id/reject', requireAuth, requireTenant, requirePermission('workflow.approve'), async (req: AuthedRequest, res) => {
  const parsed = rejectInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'comment (motif de rejet) obligatoire' })
  const wf = await loadOwnWorkflow(req.params.id, req, res)
  if (!wf) return
  if (wf.status !== 'in_review') return res.status(409).json({ error: `cannot reject: status is ${wf.status}` })

  const { error } = await supabaseAdmin
    .from('workflow_definitions')
    .update({
      status: 'draft',
      review_comment: parsed.data.comment,
      updated_at: new Date().toISOString(),
      updated_by: req.user?.id ?? null,
    })
    .eq('id', wf.id)
  if (error) return res.status(400).json({ error: error.message })
  audit(req, 'workflow.reject', wf.id, { comment: parsed.data.comment })
  // Module G : rejet — prévient le créateur avec le motif (§5.7)
  void notifyUsers([wf.created_by], {
    tenantId: req.user!.tenant_id!,
    kind: 'workflow.rejected',
    dedupeKey: `workflow.reject:${wf.id}:v${wf.version}`,
    title: `Workflow rejeté : ${wf.name}`,
    body: parsed.data.comment,
    link: '/workflows',
    entity: 'workflow_definition',
    entityId: wf.id,
    excludeUserIds: [req.user?.id],
  })
  res.json({ workflow: { ...wf, status: 'draft' } })
})

// ── Duplication versionnée (la seule façon de modifier un publié, §5.2) ────
router.post('/:id/duplicate', requireAuth, requireTenant, requirePermission('workflow.create'), async (req: AuthedRequest, res) => {
  const parsed = reasonInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'change_reason (motif de modification) obligatoire' })
  const detail = await loadWorkflow(req.params.id, req, res)
  if (!detail) return
  const { workflow: source, actions } = detail

  // La copie est TOUJOURS propre au tenant (même si la source est un workflow global)
  const tenantId = req.user!.tenant_id!
  const newCode = ownId(`${baseCode(source.id)}_V${source.version + 1}`, tenantId)
  const { data: dupe } = await supabaseAdmin.from('workflow_definitions').select('id').eq('id', newCode).maybeSingle()
  if (dupe) return res.status(409).json({ error: `version déjà existante: ${newCode}` })

  const { error: wfErr } = await supabaseAdmin.from('workflow_definitions').insert({
    id: newCode,
    tenant_id: tenantId,
    name: source.name,
    standard_clause: source.standard_clause,
    version: source.version + 1,
    owner_role: source.owner_role,
    frequency: source.frequency,
    is_active: false,
    status: 'draft',
    change_reason: parsed.data.change_reason,
    created_by: req.user?.id ?? null,
  })
  if (wfErr) return res.status(400).json({ error: wfErr.message })

  const childErr = await insertChildren(newCode, actions as any)
  if (childErr) {
    await supabaseAdmin.from('workflow_definitions').delete().eq('id', newCode)
    return res.status(400).json({ error: childErr })
  }

  audit(req, 'workflow.duplicate', newCode, { from: source.id, change_reason: parsed.data.change_reason })
  const newDetail = await loadWorkflow(newCode, req, res)
  if (newDetail) res.status(201).json(newDetail)
})

// ── Dépréciation : retrait de la bibliothèque sans suppression ──────────────
router.post('/:id/deprecate', requireAuth, requireTenant, requirePermission('workflow.approve'), async (req: AuthedRequest, res) => {
  const parsed = reasonInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'change_reason (motif) obligatoire' })
  const wf = await loadOwnWorkflow(req.params.id, req, res)
  if (!wf) return
  if (wf.status === 'deprecated') return res.status(409).json({ error: 'workflow déjà déprécié' })

  const { error } = await supabaseAdmin
    .from('workflow_definitions')
    .update({
      status: 'deprecated',
      is_active: false,
      change_reason: parsed.data.change_reason,
      updated_at: new Date().toISOString(),
      updated_by: req.user?.id ?? null,
    })
    .eq('id', wf.id)
  if (error) return res.status(400).json({ error: error.message })
  audit(req, 'workflow.deprecate', wf.id, { change_reason: parsed.data.change_reason })
  res.json({ workflow: { ...wf, status: 'deprecated', is_active: false } })
})

// ── Suppression (draft/in_review/deprecated, jamais instancié) ──────────────
router.delete('/:id', requireAuth, requireTenant, requirePermission('workflow.approve'), async (req: AuthedRequest, res) => {
  const wf = await loadOwnWorkflow(req.params.id, req, res)
  if (!wf) return
  if (!['draft', 'in_review', 'deprecated'].includes(wf.status)) {
    return res.status(409).json({ error: "un workflow publié n'est jamais supprimé — utilisez deprecate" })
  }
  const { count } = await supabaseAdmin
    .from('actions')
    .select('id', { count: 'exact', head: true })
    .eq('workflow_id', wf.id)
  if (count) return res.status(409).json({ error: "des instances d'actions existent — dépréciation seule possible" })

  // Suppression enfant→parent (les FK texte n'ont pas de cascade physique)
  const { data: acts } = await supabaseAdmin.from('workflow_actions').select('id').eq('workflow_id', wf.id)
  const actionIds = (acts ?? []).map((a) => a.id)
  if (actionIds.length) {
    const { error: sErr } = await supabaseAdmin.from('workflow_steps').delete().in('action_id', actionIds)
    if (sErr) return res.status(400).json({ error: sErr.message })
  }
  const { error: aErr } = await supabaseAdmin.from('workflow_actions').delete().eq('workflow_id', wf.id)
  if (aErr) return res.status(400).json({ error: aErr.message })
  const { error } = await supabaseAdmin.from('workflow_definitions').delete().eq('id', wf.id)
  if (error) return res.status(400).json({ error: error.message })
  audit(req, 'workflow.delete', wf.id, { status: wf.status })
  res.status(204).end()
})

export const workflowsRouter: ExpressRouter = router



