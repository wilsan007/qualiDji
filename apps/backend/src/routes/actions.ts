import { Router } from 'express'
import type { Router as ExpressRouter, Response } from 'express'
import { z } from 'zod'
import {
  requireAuth, requireTenant, requirePermission, requireAnyPermission, getPermissionsForRole, AuthedRequest,
} from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { notifyByRoles, notifyUsers } from '../lib/notify'
import { writeAudit } from '../lib/audit'
import { dbFail, parsePagination } from '../lib/http'
import { isPlatformAdmin, canSeeAllActions as canSeeAll } from '../lib/access'
import { emailMap } from '../lib/authUsers'

/**
 * Moteur d'exécution des actions (V5 §5.3) : création/assignation → exécution
 * des étapes (validées côté serveur, cf. routes/steps.ts) → soumission →
 * approbation ou rejet par une personne distincte (ségrégation des tâches).
 *
 *   assigned ──start/étape──▶ in_progress ──submit──▶ submitted ──approve──▶ approved
 *       ▲                          ▲                      │
 *       └────── assign ────────────┴──────── reject ──────┘      (blocked : exception/block)
 */
const router: ExpressRouter = Router()

/** Statuts dans lesquels l'exécutant peut encore travailler. */
const EXECUTABLE = ['assigned', 'in_progress']
/** Statuts terminaux : plus aucune transition. */
const TERMINAL = ['approved', 'closed']

/** Libellé affichable d'une instance d'action : le titre vit sur la définition (workflow_actions). */
function actionTitle(a: { id: string; workflow_actions?: unknown }): string {
  // PostgREST renvoie un objet (FK many-to-one) ; les types non générés l'inférent en tableau.
  const wa = Array.isArray(a.workflow_actions) ? a.workflow_actions[0] : a.workflow_actions
  return (wa as { title?: string } | null | undefined)?.title ?? a.id
}

function isAssignee(req: AuthedRequest, action: { assigned_to?: string | null }): boolean {
  return isPlatformAdmin(req) || action.assigned_to === req.user?.id
}

/** Charge une action du tenant courant, ou répond 404 (jamais d'indice sur un objet d'un autre tenant). */
async function loadAction(req: AuthedRequest, res: Response, select = '*, workflow_actions(title)') {
  const { data } = await supabaseAdmin
    .from('actions')
    .select(select)
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id!)
    .maybeSingle()
  const action = data as any
  if (!action) {
    res.status(404).json({ error: 'action not found' })
    return null
  }
  return action
}

/** Un exécutant ne voit que SES actions ; un gestionnaire voit tout le tenant. */
function hideIfNotVisible(req: AuthedRequest, res: Response, action: { assigned_to?: string | null }): boolean {
  if (canSeeAll(req) || action.assigned_to === req.user!.id) return false
  res.status(404).json({ error: 'action not found' })
  return true
}

function conflict(res: Response, code: string, error: string, extra: Record<string, unknown> = {}) {
  return res.status(409).json({ error, code, ...extra })
}

/** Vérifie qu'un utilisateur du tenant peut recevoir une action : actif et porteur de action.execute. */
async function checkAssignee(tenantId: string, assigneeId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('id, role, is_active')
    .eq('id', assigneeId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!profile) return 'assigné introuvable dans le tenant'
  if (profile.is_active === false) return 'assigné suspendu'
  const perms = await getPermissionsForRole(profile.role)
  if (!perms.has('action.execute')) return `le rôle ${profile.role} ne peut pas exécuter d'actions (action.execute)`
  return null
}

// Liste des actions de l'utilisateur connecté (gestionnaires : tout le tenant)
router.get('/assigned', requireAuth, requireTenant, requirePermission('action.read'), async (req: AuthedRequest, res) => {
  const user = req.user
  if (!user) return res.status(401).json({ error: 'unauthenticated' })
  const page = parsePagination(req.query)
  if (!page.ok) return res.status(400).json({ error: 'pagination invalide', code: 'ERR_INVALID_INPUT', details: page.details })
  const lim = page.limit
  const off = page.offset
  const status = typeof req.query.status === 'string' ? req.query.status : undefined

  let query = supabaseAdmin
    .from('actions')
    .select('*, workflow_definitions(*), workflow_actions(*)')
    .eq('tenant_id', user.tenant_id)
    .order('created_at', { ascending: false })
    .range(off, off + lim - 1)

  if (status) {
    query = query.eq('status', status)
  }
  if (!canSeeAll(req)) {
    query = query.eq('assigned_to', user.id)
  }

  const { data, error } = await query
  if (error) return dbFail(res, error, 'actions', 400)
  res.json({ actions: data ?? [] })
})

// Personnes assignables (action.assign) : même règle que checkAssignee — actives et porteuses de action.execute.
// Sert les formulaires de création/réassignation, sans exiger user.manage.
router.get('/assignees', requireAuth, requireTenant, requirePermission('action.assign'), async (req: AuthedRequest, res) => {
  const { data: profiles, error } = await supabaseAdmin
    .from('user_profiles')
    .select('id, role, display_name, is_active')
    .eq('tenant_id', req.user!.tenant_id!)
  if (error) return dbFail(res, error, 'actions.assignees', 500)
  const active = (profiles ?? []).filter((p) => p.is_active !== false)
  const roles = [...new Set(active.map((p) => p.role))]
  const perms = await Promise.all(roles.map((r) => getPermissionsForRole(r)))
  const executors = new Set(roles.filter((_, i) => perms[i].has('action.execute')))
  const emails = await emailMap()
  const assignees = active
    .filter((p) => executors.has(p.role))
    .map((p) => ({ id: p.id, role: p.role, display_name: p.display_name, email: emails.get(p.id) ?? null }))
  res.json({ assignees })
})

// Création + assignation d'une action à partir d'une définition publiée (action.assign)
const createSchema = z.object({
  action_def_id: z.string().min(1).max(200),
  assigned_to: z.string().uuid(),
  due_at: z.string().datetime().nullable().optional(),
})

router.post('/', requireAuth, requireTenant, requirePermission('action.assign'), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() })
  const { action_def_id, assigned_to, due_at } = parsed.data
  const tenantId = req.user!.tenant_id!

  // La définition doit appartenir à un workflow PUBLIÉ et actif (jamais un brouillon)
  const { data: def } = await supabaseAdmin
    .from('workflow_actions')
    .select('id, workflow_id, title, workflow_definitions(id, status, is_active, tenant_id)')
    .eq('id', action_def_id)
    .maybeSingle()
  const wd = Array.isArray(def?.workflow_definitions) ? def?.workflow_definitions[0] : def?.workflow_definitions
  // Définition inconnue, ou workflow d'un AUTRE tenant : indiscernables (404)
  if (!def || !wd || (wd.tenant_id !== null && wd.tenant_id !== tenantId)) return res.status(404).json({ error: 'action definition not found' })
  if (wd.status !== 'published' || wd.is_active === false) {
    return conflict(res, 'ERR_WORKFLOW_NOT_PUBLISHED', "le workflow n'est pas publié : seules les définitions publiées sont instanciables")
  }

  const assigneeError = await checkAssignee(tenantId, assigned_to)
  if (assigneeError) return res.status(400).json({ error: assigneeError, code: 'ERR_ASSIGNEE' })

  const { data: action, error } = await supabaseAdmin
    .from('actions')
    .insert({
      tenant_id: tenantId,
      workflow_id: def.workflow_id,
      action_def_id,
      assigned_to,
      assigned_by: req.user!.id,
      status: 'assigned',
      due_at: due_at ?? null,
    })
    .select('*, workflow_actions(title)')
    .single()
  if (error || !action) return res.status(400).json({ error: error?.message ?? 'création impossible' })

  await writeAudit({
    tenantId, actorId: req.user!.id, action: 'action.create', entity: 'action', entityId: action.id,
    payload: { action_def_id, workflow_id: def.workflow_id, assigned_to, due_at: due_at ?? null },
  })
  void notifyUsers([assigned_to], {
    tenantId,
    kind: 'action.assigned',
    dedupeKey: `action.assigned:${action.id}:${assigned_to}`,
    title: `Action assignée : ${actionTitle(action)}`,
    body: due_at ? `Échéance : ${due_at.slice(0, 10)}` : undefined,
    link: `/workflow/${action.id}`,
    entity: 'action',
    entityId: action.id,
    excludeUserIds: [req.user!.id],
  })
  res.status(201).json({ action })
})

// Détail d'une action (avec les étapes de la définition et les saisies déjà enregistrées)
router.get('/:id', requireAuth, requireTenant, requirePermission('action.read'), async (req: AuthedRequest, res) => {
  const action = await loadAction(
    req, res,
    '*, workflow_definitions(*), workflow_actions(*, workflow_steps(*)), step_submissions(*)',
  )
  if (!action) return
  if (hideIfNotVisible(req, res, action)) return
  res.json({ action })
})

// Réassignation (action.assign) — tant que l'action n'est ni soumise ni terminée
const assignSchema = z.object({ assigned_to: z.string().uuid() })
router.post('/:id/assign', requireAuth, requireTenant, requirePermission('action.assign'), async (req: AuthedRequest, res) => {
  const parsed = assignSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() })
  const action = await loadAction(req, res)
  if (!action) return
  if (![...EXECUTABLE, 'blocked'].includes(action.status)) {
    return conflict(res, 'ERR_ACTION_STATUS', `réassignation impossible : statut ${action.status}`)
  }
  const assigneeError = await checkAssignee(req.user!.tenant_id!, parsed.data.assigned_to)
  if (assigneeError) return res.status(400).json({ error: assigneeError, code: 'ERR_ASSIGNEE' })

  const { data: updated } = await supabaseAdmin
    .from('actions')
    .update({ assigned_to: parsed.data.assigned_to, assigned_by: req.user!.id })
    .eq('id', action.id)
    .eq('tenant_id', req.user!.tenant_id!)
    .eq('status', action.status)
    .select('*, workflow_actions(title)')
    .maybeSingle()
  if (!updated) return conflict(res, 'ERR_ACTION_STATUS', "l'action a changé de statut entre-temps")

  await writeAudit({
    tenantId: req.user!.tenant_id!, actorId: req.user!.id, action: 'action.assign', entity: 'action', entityId: action.id,
    payload: { from: action.assigned_to, to: parsed.data.assigned_to },
  })
  void notifyUsers([parsed.data.assigned_to], {
    tenantId: req.user!.tenant_id!,
    kind: 'action.assigned',
    dedupeKey: `action.assigned:${action.id}:${parsed.data.assigned_to}`,
    title: `Action assignée : ${actionTitle(updated)}`,
    link: `/workflow/${action.id}`,
    entity: 'action',
    entityId: action.id,
    excludeUserIds: [req.user!.id],
  })
  res.json({ action: updated })
})

// Démarrer une action (exécutant) : assigned → in_progress
router.post('/:id/start', requireAuth, requireTenant, requirePermission('action.execute'), async (req: AuthedRequest, res) => {
  const action = await loadAction(req, res)
  if (!action) return
  if (hideIfNotVisible(req, res, action)) return
  if (!isAssignee(req, action)) return res.status(403).json({ error: "action non assignée à l'utilisateur", code: 'ERR_NOT_ASSIGNEE' })
  if (action.status !== 'assigned') return conflict(res, 'ERR_ACTION_STATUS', `démarrage impossible : statut ${action.status}`)

  const { data: updated } = await supabaseAdmin
    .from('actions')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .eq('id', action.id)
    .eq('tenant_id', req.user!.tenant_id!)
    .eq('status', 'assigned')
    .select('*, workflow_actions(title)')
    .maybeSingle()
  if (!updated) return conflict(res, 'ERR_ACTION_STATUS', "l'action a changé de statut entre-temps")
  await writeAudit({ tenantId: req.user!.tenant_id!, actorId: req.user!.id, action: 'action.start', entity: 'action', entityId: action.id })
  res.json({ action: updated })
})

// Soumettre l'action : exige toutes les étapes obligatoires saisies (l'approbation n'est pas une saisie)
router.post('/:id/submit', requireAuth, requireTenant, requirePermission('action.submit'), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenant_id!
  const action = await loadAction(req, res)
  if (!action) return
  if (hideIfNotVisible(req, res, action)) return
  if (!isAssignee(req, action)) return res.status(403).json({ error: "action non assignée à l'utilisateur", code: 'ERR_NOT_ASSIGNEE' })
  if (!EXECUTABLE.includes(action.status)) {
    return conflict(res, 'ERR_ACTION_STATUS', `soumission impossible : statut ${action.status}`)
  }

  const [{ data: steps }, { data: subs }] = await Promise.all([
    supabaseAdmin.from('workflow_steps').select('id, title, step_type, required').eq('action_id', action.action_def_id),
    supabaseAdmin.from('step_submissions').select('step_id').eq('action_id', action.id),
  ])
  const done = new Set((subs ?? []).map((s) => s.step_id))
  const missing = (steps ?? [])
    .filter((s) => s.required && s.step_type !== 'approval' && !done.has(s.id))
    .map((s) => ({ id: s.id, title: s.title }))
  if (missing.length) {
    return conflict(res, 'ERR_STEPS_INCOMPLETE', 'étapes obligatoires non saisies', { missing })
  }

  const now = new Date().toISOString()
  const { data: updated } = await supabaseAdmin
    .from('actions')
    .update({ status: 'submitted', submitted_at: now, started_at: action.started_at ?? now })
    .eq('id', action.id)
    .eq('tenant_id', tenantId)
    .eq('status', action.status)
    .select('*, workflow_actions(title)')
    .maybeSingle()
  if (!updated) return conflict(res, 'ERR_ACTION_STATUS', "l'action a changé de statut entre-temps")

  await writeAudit({ tenantId, actorId: req.user!.id, action: 'action.submit', entity: 'action', entityId: action.id })
  // Module G : approbation requise — prévient l'autorité qualité (§5.7)
  void notifyByRoles(['quality_manager'], {
    tenantId,
    kind: 'action.submitted',
    dedupeKey: `action.submitted:${action.id}:${now}`,
    title: `Action soumise : ${actionTitle(updated)}`,
    body: 'Validation requise',
    link: `/workflow/${action.id}`,
    entity: 'action',
    entityId: action.id,
    excludeUserIds: [req.user!.id],
  })
  res.json({ action: updated })
})

// Approbation (action.approve) : ségrégation des tâches + rôle d'approbateur de la définition
const reviewSchema = z.object({ comment: z.string().trim().max(2000).optional() })
router.post('/:id/approve', requireAuth, requireTenant, requirePermission('action.approve'), async (req: AuthedRequest, res) => {
  const parsed = reviewSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() })
  const tenantId = req.user!.tenant_id!
  const action = await loadAction(req, res)
  if (!action) return
  if (action.status !== 'submitted') return conflict(res, 'ERR_ACTION_STATUS', `approbation impossible : statut ${action.status}`)

  const [{ data: steps }, { data: subs }] = await Promise.all([
    supabaseAdmin.from('workflow_steps').select('id, step_type, approver_role, segregation_of_duties').eq('action_id', action.action_def_id),
    supabaseAdmin.from('step_submissions').select('submitted_by').eq('action_id', action.id),
  ])
  const approvalStep = (steps ?? []).find((s) => s.step_type === 'approval')

  // Rôle d'approbateur fixé par la définition (le tenant_admin et les rôles plateforme restent habilités)
  const role = req.user!.role ?? ''
  if (approvalStep?.approver_role && role !== approvalStep.approver_role && role !== 'tenant_admin' && !isPlatformAdmin(req)) {
    return res.status(403).json({
      error: `approbation réservée au rôle ${approvalStep.approver_role}`,
      code: 'ERR_APPROVER_ROLE',
    })
  }

  // Ségrégation des tâches : sans étape d'approbation déclarée, on l'applique par défaut (sûr par défaut)
  const sod = approvalStep ? approvalStep.segregation_of_duties : true
  if (sod) {
    const actors = new Set<string>([action.assigned_to, ...(subs ?? []).map((s) => s.submitted_by)].filter(Boolean))
    if (actors.has(req.user!.id)) {
      await writeAudit({
        tenantId, actorId: req.user!.id, action: 'action.approve_blocked', entity: 'action', entityId: action.id,
        payload: { reason: 'segregation_of_duties' },
      })
      return res.status(403).json({
        error: "ségrégation des tâches : l'approbateur ne peut pas être la personne qui a exécuté l'action",
        code: 'ERR_SEGREGATION_OF_DUTIES',
      })
    }
  }

  const now = new Date().toISOString()
  const { data: updated } = await supabaseAdmin
    .from('actions')
    .update({ status: 'approved', reviewed_by: req.user!.id, reviewed_at: now, review_comment: parsed.data.comment ?? null })
    .eq('id', action.id)
    .eq('tenant_id', tenantId)
    .eq('status', 'submitted')
    .select('*, workflow_actions(title)')
    .maybeSingle()
  if (!updated) return conflict(res, 'ERR_ACTION_STATUS', "l'action a changé de statut entre-temps")

  // L'approbation est l'étape finale du workflow : on la consigne comme saisie signée de l'approbateur
  if (approvalStep) {
    await supabaseAdmin.from('step_submissions').upsert(
      {
        action_id: action.id,
        step_id: approvalStep.id,
        tenant_id: tenantId,
        value: { decision: 'approved', comment: parsed.data.comment ?? null },
        submitted_by: req.user!.id,
        submitted_at: now,
      },
      { onConflict: 'action_id,step_id' },
    )
  }
  await writeAudit({
    tenantId, actorId: req.user!.id, action: 'action.approve', entity: 'action', entityId: action.id,
    payload: { comment: parsed.data.comment ?? null },
  })
  void notifyUsers([action.assigned_to], {
    tenantId,
    kind: 'action.approved',
    dedupeKey: `action.approved:${action.id}:${now}`,
    title: `Action approuvée : ${actionTitle(updated)}`,
    link: `/workflow/${action.id}`,
    entity: 'action',
    entityId: action.id,
    excludeUserIds: [req.user!.id],
  })
  res.json({ action: updated })
})

// Rejet : retour à l'exécutant (in_progress), motif obligatoire
const rejectSchema = z.object({ comment: z.string().trim().min(3).max(2000) })
router.post('/:id/reject', requireAuth, requireTenant, requirePermission('action.approve'), async (req: AuthedRequest, res) => {
  const parsed = rejectSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'comment (motif de rejet) obligatoire', code: 'ERR_COMMENT_REQUIRED' })
  const tenantId = req.user!.tenant_id!
  const action = await loadAction(req, res)
  if (!action) return
  if (action.status !== 'submitted') return conflict(res, 'ERR_ACTION_STATUS', `rejet impossible : statut ${action.status}`)

  const now = new Date().toISOString()
  const { data: updated } = await supabaseAdmin
    .from('actions')
    .update({ status: 'in_progress', reviewed_by: req.user!.id, reviewed_at: now, review_comment: parsed.data.comment })
    .eq('id', action.id)
    .eq('tenant_id', tenantId)
    .eq('status', 'submitted')
    .select('*, workflow_actions(title)')
    .maybeSingle()
  if (!updated) return conflict(res, 'ERR_ACTION_STATUS', "l'action a changé de statut entre-temps")

  await writeAudit({
    tenantId, actorId: req.user!.id, action: 'action.reject', entity: 'action', entityId: action.id,
    payload: { comment: parsed.data.comment },
  })
  void notifyUsers([action.assigned_to], {
    tenantId,
    kind: 'action.rejected',
    dedupeKey: `action.rejected:${action.id}:${now}`,
    title: `Action rejetée : ${actionTitle(updated)}`,
    body: parsed.data.comment,
    link: `/workflow/${action.id}`,
    entity: 'action',
    entityId: action.id,
    excludeUserIds: [req.user!.id],
  })
  res.json({ action: updated })
})

/** Blocage / exception : l'exécutant sur SES actions, ou un approbateur ; jamais sur une action terminée. */
function mayBlock(req: AuthedRequest, action: { assigned_to?: string | null }): boolean {
  return isAssignee(req, action) || (req.permissions?.has('action.approve') ?? false) || isPlatformAdmin(req)
}

// Bloquer une action (guardrail)
router.post('/:id/block', requireAuth, requireTenant, requireAnyPermission(['action.execute', 'action.approve']), async (req: AuthedRequest, res) => {
  const action = await loadAction(req, res)
  if (!action) return
  if (hideIfNotVisible(req, res, action)) return
  if (!mayBlock(req, action)) return res.status(403).json({ error: "action non assignée à l'utilisateur", code: 'ERR_NOT_ASSIGNEE' })
  if (TERMINAL.includes(action.status) || action.status === 'blocked') {
    return conflict(res, 'ERR_ACTION_STATUS', `blocage impossible : statut ${action.status}`)
  }
  const { data: updated } = await supabaseAdmin
    .from('actions')
    .update({ status: 'blocked' })
    .eq('id', action.id)
    .eq('tenant_id', req.user!.tenant_id!)
    .eq('status', action.status)
    .select('*, workflow_actions(title)')
    .maybeSingle()
  if (!updated) return conflict(res, 'ERR_ACTION_STATUS', "l'action a changé de statut entre-temps")
  await writeAudit({ tenantId: req.user!.tenant_id!, actorId: req.user!.id, action: 'action.block', entity: 'action', entityId: action.id, payload: { from: action.status } })
  // Module G : action bloquée — alerte l'autorité qualité (§5.7)
  void notifyByRoles(['quality_manager'], {
    tenantId: req.user!.tenant_id!,
    kind: 'action.blocked',
    dedupeKey: `action.blocked:${action.id}`,
    title: `Action bloquée : ${actionTitle(updated)}`,
    link: `/workflow/${action.id}`,
    entity: 'action',
    entityId: action.id,
    excludeUserIds: [req.user!.id],
  })
  res.json({ action: updated })
})

// Déclarer une exception sur une action (→ NC)
const exceptionSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
  severity: z.enum(['minor', 'major', 'critical']).default('minor'),
})
router.post('/:id/exception', requireAuth, requireTenant, requireAnyPermission(['action.execute', 'action.approve']), async (req: AuthedRequest, res) => {
  const parsed = exceptionSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'reason required', details: parsed.error.flatten() })
  const { reason, severity } = parsed.data
  const tenantId = req.user!.tenant_id!

  const action = await loadAction(req, res)
  if (!action) return
  if (hideIfNotVisible(req, res, action)) return
  if (!mayBlock(req, action)) return res.status(403).json({ error: "action non assignée à l'utilisateur", code: 'ERR_NOT_ASSIGNEE' })
  if (TERMINAL.includes(action.status)) return conflict(res, 'ERR_ACTION_STATUS', `exception impossible : statut ${action.status}`)

  const { data: nc, error } = await supabaseAdmin
    .from('nonconformities')
    .insert({
      tenant_id: tenantId,
      action_id: action.id,
      title: `Exception sur action ${actionTitle(action)}`,
      severity,
      status: 'open',
      created_by: req.user!.id,
    })
    .select()
    .single()

  if (error) return dbFail(res, error, 'actions', 400)

  await supabaseAdmin.from('actions').update({ status: 'blocked' }).eq('id', action.id).eq('tenant_id', tenantId)
  await writeAudit({
    tenantId, actorId: req.user!.id, action: 'action.exception', entity: 'action', entityId: action.id,
    payload: { nonconformity_id: nc.id, severity, reason },
  })

  // Module G : NC ouverte via exception — prévient qualité + admin tenant (§5.7)
  void notifyByRoles(['quality_manager', 'tenant_admin'], {
    tenantId,
    kind: 'nc.created',
    dedupeKey: `nc.created:${nc.id}`,
    title: `Non-conformité déclarée : ${nc.title}`,
    body: `Sévérité : ${severity}`,
    link: '/nc',
    entity: 'nonconformity',
    entityId: nc.id,
    excludeUserIds: [req.user!.id],
  })

  res.status(201).json({ nonconformity: nc })
})

export const actionsRouter: ExpressRouter = router
