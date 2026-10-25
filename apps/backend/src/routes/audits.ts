import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { z } from 'zod'
import { requireAuth, requireTenant, requirePermission, requireAnyPermission, getPermissionsForRole, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { notifyUsers } from '../lib/notify'
import { auditFromReq } from '../lib/audit'
import { dbFail } from '../lib/http'
import { emailMap } from '../lib/authUsers'

/**
 * §9.2 Audits internes (WF_INTERNAL_AUDIT, §F.4) :
 * auto-audit interdit (auditeur ≠ créateur), constat original immuable
 * (réponse sur champs séparés), vérification par personne distincte du
 * répondant, réouverture si efficacité non conforme.
 */
const router: ExpressRouter = Router()

/** Rôles habilités à être désignés auditeur (contrôlé côté serveur, pas seulement dans le formulaire). */
const AUDITOR_ROLES = ['tenant_admin', 'quality_manager', 'internal_auditor']
const ACCESS_AUDITS = ['internal_audit.manage', 'internal_audit.respond']

const auditInput = z.object({
  title: z.string().min(3).max(300),
  scope: z.string().min(3).max(4000),
  criteria: z.string().min(3).max(4000),
  auditor_id: z.string().uuid(),
  planned_at: z.string().datetime().nullable().optional(),
})

const findingInput = z.object({
  title: z.string().min(3).max(300),
  description: z.string().min(3).max(8000),
  classification: z.enum(['major', 'minor', 'observation']).default('minor'),
  process_owner_id: z.string().uuid().nullable().optional(),
})

const respondInput = z.object({
  response: z.string().min(3).max(8000),
  corrective_action: z.string().max(8000).nullable().optional(),
  due_at: z.string().datetime().nullable().optional(),
})

const verifyInput = z.object({
  effective: z.boolean(),
  comment: z.string().max(4000).nullable().optional(),
})

function auditLog(req: AuthedRequest, action: string, entityId: string, payload: Record<string, unknown> = {}) {
  return auditFromReq(req, action, 'internal_audit', entityId, payload)
}

const closeInput = z.object({ summary: z.string().trim().min(3).max(8000) })

// ── Membres éligibles (auditeurs + répondants) pour les formulaires ─────────
router.get('/members/eligible', requireAuth, requireTenant, requirePermission('internal_audit.manage'), async (req: AuthedRequest, res) => {
  const { data: profiles } = await supabaseAdmin
    .from('user_profiles').select('id, role, display_name').eq('tenant_id', req.user!.tenant_id!)
  const emails = await emailMap()
  const members = (profiles ?? []).map((p) => ({ ...p, email: emails.get(p.id) ?? null }))
  res.json({
    auditors: members.filter((m) => AUDITOR_ROLES.includes(m.role)),
    members,
  })
})

// ── Liste : gestionnaires d'audit (manage) ET répondants (respond) voient le programme ──
router.get('/', requireAuth, requireTenant, requireAnyPermission(ACCESS_AUDITS), async (req: AuthedRequest, res) => {
  const { data: audits, error } = await supabaseAdmin
    .from('internal_audits')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id!)
    .order('created_at', { ascending: false })
  if (error) return dbFail(res, error, 'audits', 500)
  const ids = (audits ?? []).map((a) => a.id)
  const { data: findings } = ids.length
    ? await supabaseAdmin.from('audit_findings').select('*').eq('tenant_id', req.user!.tenant_id!).in('audit_id', ids)
    : { data: [] }
  const byAudit = new Map<string, any[]>()
  for (const f of findings ?? []) {
    const list = byAudit.get(f.audit_id) ?? []
    list.push(f)
    byAudit.set(f.audit_id, list)
  }
  res.json({ audits: (audits ?? []).map((a) => ({ ...a, findings: byAudit.get(a.id) ?? [] })) })
})

// ── Détail ──────────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, requireTenant, requireAnyPermission(ACCESS_AUDITS), async (req: AuthedRequest, res) => {
  const { data: audit } = await supabaseAdmin
    .from('internal_audits').select('*').eq('tenant_id', req.user!.tenant_id!).eq('id', req.params.id).single()
  if (!audit) return res.status(404).json({ error: 'audit not found' })
  const { data: findings } = await supabaseAdmin
    .from('audit_findings').select('*').eq('audit_id', audit.id).order('created_at')
  res.json({ audit, findings: findings ?? [] })
})

// ── Création du plan (ANTI AUTO-AUDIT §F.4) ─────────────────────────────────
router.post('/', requireAuth, requireTenant, requirePermission('internal_audit.manage'), async (req: AuthedRequest, res) => {
  const parsed = auditInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() })
  const input = parsed.data

  if (input.auditor_id === req.user!.id) {
    await auditLog(req, 'audit.auto_audit_blocked', 'n/a', { auditor_id: input.auditor_id })
    return res.status(400).json({
      error: 'auto-audit interdit (§F.4) : l auditeur doit être une personne autre que vous — réaffectation exigée',
      code: 'ERR_AUTO_AUDIT',
    })
  }
  const { data: auditor } = await supabaseAdmin
    .from('user_profiles').select('id, role').eq('id', input.auditor_id).eq('tenant_id', req.user!.tenant_id!).single()
  if (!auditor) return res.status(400).json({ error: 'auditeur introuvable dans le tenant' })
  if (!AUDITOR_ROLES.includes(auditor.role)) {
    return res.status(400).json({ error: `le rôle ${auditor.role} ne peut pas être désigné auditeur`, code: 'ERR_AUDITOR_ROLE' })
  }

  const { data: audit, error } = await supabaseAdmin
    .from('internal_audits')
    .insert({
      tenant_id: req.user!.tenant_id!, title: input.title, scope: input.scope, criteria: input.criteria,
      auditor_id: input.auditor_id, planned_at: input.planned_at ?? null, created_by: req.user!.id,
    })
    .select().single()
  if (error) return dbFail(res, error, 'audits', 400)
  await auditLog(req, 'audit.create', audit.id, { auditor_id: input.auditor_id })
  res.status(201).json({ audit })
})

// ── Démarrage : planned → in_progress ───────────────────────────────────────
router.post('/:id/start', requireAuth, requireTenant, requirePermission('internal_audit.manage'), async (req: AuthedRequest, res) => {
  const { data: audit } = await supabaseAdmin.from('internal_audits').select('*').eq('tenant_id', req.user!.tenant_id!).eq('id', req.params.id).single()
  if (!audit) return res.status(404).json({ error: 'audit not found' })
  if (audit.status !== 'planned') return res.status(409).json({ error: `cannot start: status is ${audit.status}` })
  const { data: started, error } = await supabaseAdmin.from('internal_audits')
    .update({ status: 'in_progress', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', audit.id).eq('status', 'planned').select('id')
  if (error) return dbFail(res, error, 'audits.start')
  if (!started?.length) return res.status(409).json({ error: "cannot start: l'audit a changé d'état" })
  await auditLog(req, 'audit.start', audit.id)
  res.json({ audit: { ...audit, status: 'in_progress' } })
})

// ── Clôture : interdite tant qu un constat n est pas résolu ─────────────────
router.post('/:id/close', requireAuth, requireTenant, requirePermission('internal_audit.manage'), async (req: AuthedRequest, res) => {
  const parsedClose = closeInput.safeParse(req.body ?? {})
  if (!parsedClose.success) return res.status(400).json({ error: 'summary (synthèse de clôture) obligatoire' })
  const summary = parsedClose.data.summary
  const { data: audit } = await supabaseAdmin.from('internal_audits').select('*').eq('tenant_id', req.user!.tenant_id!).eq('id', req.params.id).single()
  if (!audit) return res.status(404).json({ error: 'audit not found' })
  if (audit.status !== 'in_progress') return res.status(409).json({ error: `cannot close: status is ${audit.status}` })

  const { data: openFindings } = await supabaseAdmin
    .from('audit_findings').select('id, title, status').eq('audit_id', audit.id)
    .in('status', ['open', 'responded', 'reopened'])
  if (openFindings?.length) {
    return res.status(409).json({
      error: 'constats non résolus — vérification d efficacité requise avant clôture (§F.4)',
      open_findings: openFindings.map((f) => ({ id: f.id, title: f.title, status: f.status })),
    })
  }
  const now = new Date().toISOString()
  const { data: closed, error } = await supabaseAdmin.from('internal_audits')
    .update({ status: 'closed', closed_at: now, summary, updated_at: now }).eq('id', audit.id).eq('status', 'in_progress').select('id')
  if (error) return dbFail(res, error, 'audits.close')
  if (!closed?.length) return res.status(409).json({ error: "cannot close: l'audit a changé d'état" })
  await auditLog(req, 'audit.close', audit.id)
  res.json({ audit: { ...audit, status: 'closed', closed_at: now, summary } })
})

// ── Constat (audit en cours) + notification au responsable de processus ─────
router.post('/:id/findings', requireAuth, requireTenant, requirePermission('internal_audit.manage'), async (req: AuthedRequest, res) => {
  const parsed = findingInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() })
  const input = parsed.data
  const { data: audit } = await supabaseAdmin.from('internal_audits').select('*').eq('tenant_id', req.user!.tenant_id!).eq('id', req.params.id).single()
  if (!audit) return res.status(404).json({ error: 'audit not found' })
  if (audit.status !== 'in_progress') return res.status(409).json({ error: 'constats possibles uniquement pendant la réalisation' })
  if (input.process_owner_id) {
    const { data: owner } = await supabaseAdmin
      .from('user_profiles').select('id, role').eq('id', input.process_owner_id).eq('tenant_id', req.user!.tenant_id!).maybeSingle()
    if (!owner) return res.status(400).json({ error: 'responsable de processus introuvable dans le tenant', code: 'ERR_PROCESS_OWNER' })
    // Le responsable désigné doit pouvoir répondre, sinon le constat resterait bloqué
    if (!(await getPermissionsForRole(owner.role)).has('internal_audit.respond')) {
      return res.status(400).json({
        error: `le rôle ${owner.role} ne peut pas répondre aux constats (internal_audit.respond) — désignez un autre responsable`,
        code: 'ERR_PROCESS_OWNER',
      })
    }
  }

  const { data: finding, error } = await supabaseAdmin
    .from('audit_findings')
    .insert({
      tenant_id: req.user!.tenant_id!, audit_id: audit.id, title: input.title,
      description: input.description, classification: input.classification,
      process_owner_id: input.process_owner_id ?? null, created_by: req.user!.id,
    })
    .select().single()
  if (error) return dbFail(res, error, 'audits', 400)
  await auditLog(req, 'audit.finding', finding.id, { audit_id: audit.id, classification: input.classification })
  void notifyUsers([input.process_owner_id], {
    tenantId: req.user!.tenant_id!,
    kind: 'audit.finding',
    dedupeKey: `audit.finding:${finding.id}`,
    title: `Constat d audit : ${input.title}`,
    body: `Classification : ${input.classification} — réponse attendue`,
    link: '/audits',
    entity: 'audit_finding',
    entityId: finding.id,
    excludeUserIds: [req.user?.id],
  })
  res.status(201).json({ finding })
})

// ── Réponse du processus (le constat d origine n est JAMAIS modifié) ────────
router.post('/findings/:id/respond', requireAuth, requireTenant, requirePermission('internal_audit.respond'), async (req: AuthedRequest, res) => {
  const parsed = respondInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() })
  const { data: finding } = await supabaseAdmin.from('audit_findings').select('*').eq('tenant_id', req.user!.tenant_id!).eq('id', req.params.id).single()
  if (!finding) return res.status(404).json({ error: 'finding not found' })
  if (!['open', 'responded', 'reopened'].includes(finding.status)) {
    return res.status(409).json({ error: `cannot respond: status is ${finding.status}` })
  }
  // La réponse appartient au responsable de processus désigné (§F.4) ; sans responsable désigné,
  // tout détenteur de internal_audit.respond peut répondre.
  if (finding.process_owner_id && finding.process_owner_id !== req.user!.id) {
    return res.status(403).json({
      error: 'seul le responsable de processus désigné peut répondre à ce constat',
      code: 'ERR_NOT_PROCESS_OWNER',
    })
  }
  const now = new Date().toISOString()
  const { data: responded, error } = await supabaseAdmin.from('audit_findings').update({
    response: parsed.data.response,
    corrective_action: parsed.data.corrective_action ?? finding.corrective_action,
    due_at: parsed.data.due_at ?? finding.due_at,
    status: 'responded',
    responded_at: now,
    responded_by: req.user!.id,
    updated_at: now,
  }).eq('id', finding.id).in('status', ['open', 'responded', 'reopened']).select('id')
  if (error) return dbFail(res, error, 'audits.respond')
  if (!responded?.length) return res.status(409).json({ error: 'cannot respond: le constat a changé d\'état' })
  await auditLog(req, 'audit.finding_respond', finding.id, { audit_id: finding.audit_id })
  void notifyUsers([finding.created_by], {
    tenantId: req.user!.tenant_id!,
    kind: 'audit.finding_responded',
    dedupeKey: `audit.finding_responded:${finding.id}`,
    title: `Réponse au constat : ${finding.title}`,
    body: 'Vérification d efficacité requise',
    link: '/audits',
    entity: 'audit_finding',
    entityId: finding.id,
    excludeUserIds: [req.user?.id],
  })
  res.json({ finding: { ...finding, status: 'responded', response: parsed.data.response } })
})

// ── Vérification : personne DISTINCTE du répondant (§F.4) ──────────────────
router.post('/findings/:id/verify', requireAuth, requireTenant, requirePermission('internal_audit.manage'), async (req: AuthedRequest, res) => {
  const parsed = verifyInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() })
  const { data: finding } = await supabaseAdmin.from('audit_findings').select('*').eq('tenant_id', req.user!.tenant_id!).eq('id', req.params.id).single()
  if (!finding) return res.status(404).json({ error: 'finding not found' })
  if (!['responded', 'reopened'].includes(finding.status)) {
    return res.status(409).json({ error: `cannot verify: status is ${finding.status}` })
  }
  const verifier = req.user!.id
  if (verifier === finding.responded_by || verifier === finding.process_owner_id) {
    await auditLog(req, 'audit.verify_blocked', finding.id, { verifier })
    return res.status(400).json({
      error: 'vérification exigée par une personne DISTINCTE du répondant (§F.4) — réaffectation',
      code: 'ERR_SAME_PERSON_VERIFY',
    })
  }
  const now = new Date().toISOString()
  const status = parsed.data.effective ? 'verified_effective' : 'reopened'
  const { data: verified, error } = await supabaseAdmin.from('audit_findings').update({
    status,
    verified_by: verifier,
    verified_at: now,
    verification_comment: parsed.data.comment ?? null,
    updated_at: now,
  }).eq('id', finding.id).in('status', ['responded', 'reopened']).select('id')
  if (error) return dbFail(res, error, 'audits.verify')
  if (!verified?.length) return res.status(409).json({ error: 'cannot verify: le constat a changé d\'état' })
  await auditLog(req, parsed.data.effective ? 'audit.finding_verified' : 'audit.finding_reopened', finding.id)
  void notifyUsers([finding.responded_by, finding.process_owner_id], {
    tenantId: req.user!.tenant_id!,
    kind: parsed.data.effective ? 'audit.finding_verified' : 'audit.finding_reopened',
    dedupeKey: `audit.finding_verify:${finding.id}:${status}`,
    title: parsed.data.effective ? `Constat vérifié efficace : ${finding.title}` : `Constat réouvert : ${finding.title}`,
    body: parsed.data.comment ?? undefined,
    link: '/audits',
    entity: 'audit_finding',
    entityId: finding.id,
    excludeUserIds: [verifier],
  })
  res.json({ finding: { ...finding, status } })
})

export const auditsRouter: ExpressRouter = router


