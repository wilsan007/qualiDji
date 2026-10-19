import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { z } from 'zod'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { notifyUsers } from '../lib/notify'

/**
 * §9.2 Audits internes (WF_INTERNAL_AUDIT, §F.4) :
 * auto-audit interdit (auditeur ≠ créateur), constat original immuable
 * (réponse sur champs séparés), vérification par personne distincte du
 * répondant, réouverture si efficacité non conforme.
 */
const router: ExpressRouter = Router()

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
  const user = req.user
  if (!user?.tenant_id) return
  void supabaseAdmin.from('audit_log').insert({
    tenant_id: user.tenant_id, actor_id: user.id, action, entity: 'internal_audit', entity_id: entityId, payload,
  })
}

// ── Membres éligibles (auditeurs + répondants) pour les formulaires ─────────
router.get('/members/eligible', requireAuth, requireTenant, requirePermission('internal_audit.manage'), async (req: AuthedRequest, res) => {
  const { data: profiles } = await supabaseAdmin
    .from('user_profiles').select('id, role, display_name').eq('tenant_id', req.user!.tenant_id!)
  const { data: listed } = await supabaseAdmin.auth.admin.listUsers()
  const emails = new Map((listed?.users ?? []).map((u) => [u.id, u.email]))
  const members = (profiles ?? []).map((p) => ({ ...p, email: emails.get(p.id) ?? null }))
  const AUDITOR_ROLES = ['tenant_admin', 'quality_manager', 'internal_auditor']
  res.json({
    auditors: members.filter((m) => AUDITOR_ROLES.includes(m.role)),
    members,
  })
})

// ── Liste (auditeurs et répondants voient le programme) ─────────────────────
router.get('/', requireAuth, requireTenant, requirePermission('internal_audit.respond'), async (req: AuthedRequest, res) => {
  const { data: audits, error } = await supabaseAdmin
    .from('internal_audits')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id!)
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
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
router.get('/:id', requireAuth, requireTenant, requirePermission('internal_audit.respond'), async (req: AuthedRequest, res) => {
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
    auditLog(req, 'audit.auto_audit_blocked', 'n/a', { auditor_id: input.auditor_id })
    return res.status(400).json({
      error: 'auto-audit interdit (§F.4) : l auditeur doit être une personne autre que vous — réaffectation exigée',
      code: 'ERR_AUTO_AUDIT',
    })
  }
  const { data: auditor } = await supabaseAdmin
    .from('user_profiles').select('id, role').eq('id', input.auditor_id).eq('tenant_id', req.user!.tenant_id!).single()
  if (!auditor) return res.status(400).json({ error: 'auditeur introuvable dans le tenant' })

  const { data: audit, error } = await supabaseAdmin
    .from('internal_audits')
    .insert({
      tenant_id: req.user!.tenant_id!, title: input.title, scope: input.scope, criteria: input.criteria,
      auditor_id: input.auditor_id, planned_at: input.planned_at ?? null, created_by: req.user!.id,
    })
    .select().single()
  if (error) return res.status(400).json({ error: error.message })
  auditLog(req, 'audit.create', audit.id, { auditor_id: input.auditor_id })
  res.status(201).json({ audit })
})

// ── Démarrage : planned → in_progress ───────────────────────────────────────
router.post('/:id/start', requireAuth, requireTenant, requirePermission('internal_audit.manage'), async (req: AuthedRequest, res) => {
  const { data: audit } = await supabaseAdmin.from('internal_audits').select('*').eq('tenant_id', req.user!.tenant_id!).eq('id', req.params.id).single()
  if (!audit) return res.status(404).json({ error: 'audit not found' })
  if (audit.status !== 'planned') return res.status(409).json({ error: `cannot start: status is ${audit.status}` })
  const { error } = await supabaseAdmin.from('internal_audits')
    .update({ status: 'in_progress', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', audit.id)
  if (error) return res.status(400).json({ error: error.message })
  auditLog(req, 'audit.start', audit.id)
  res.json({ audit: { ...audit, status: 'in_progress' } })
})

// ── Clôture : interdite tant qu un constat n est pas résolu ─────────────────
router.post('/:id/close', requireAuth, requireTenant, requirePermission('internal_audit.manage'), async (req: AuthedRequest, res) => {
  const summary = (req.body as { summary?: string }).summary
  if (!summary || summary.trim().length < 3) return res.status(400).json({ error: 'summary (synthèse de clôture) obligatoire' })
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
  const { error } = await supabaseAdmin.from('internal_audits')
    .update({ status: 'closed', closed_at: now, summary, updated_at: now }).eq('id', audit.id)
  if (error) return res.status(400).json({ error: error.message })
  auditLog(req, 'audit.close', audit.id)
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

  const { data: finding, error } = await supabaseAdmin
    .from('audit_findings')
    .insert({
      tenant_id: req.user!.tenant_id!, audit_id: audit.id, title: input.title,
      description: input.description, classification: input.classification,
      process_owner_id: input.process_owner_id ?? null, created_by: req.user!.id,
    })
    .select().single()
  if (error) return res.status(400).json({ error: error.message })
  auditLog(req, 'audit.finding', finding.id, { audit_id: audit.id, classification: input.classification })
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
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin.from('audit_findings').update({
    response: parsed.data.response,
    corrective_action: parsed.data.corrective_action ?? finding.corrective_action,
    due_at: parsed.data.due_at ?? finding.due_at,
    status: 'responded',
    responded_at: now,
    responded_by: req.user!.id,
    updated_at: now,
  }).eq('id', finding.id)
  if (error) return res.status(400).json({ error: error.message })
  auditLog(req, 'audit.finding_respond', finding.id, { audit_id: finding.audit_id })
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
    auditLog(req, 'audit.verify_blocked', finding.id, { verifier })
    return res.status(400).json({
      error: 'vérification exigée par une personne DISTINCTE du répondant (§F.4) — réaffectation',
      code: 'ERR_SAME_PERSON_VERIFY',
    })
  }
  const now = new Date().toISOString()
  const status = parsed.data.effective ? 'verified_effective' : 'reopened'
  const { error } = await supabaseAdmin.from('audit_findings').update({
    status,
    verified_by: verifier,
    verified_at: now,
    verification_comment: parsed.data.comment ?? null,
    updated_at: now,
  }).eq('id', finding.id)
  if (error) return res.status(400).json({ error: error.message })
  auditLog(req, parsed.data.effective ? 'audit.finding_verified' : 'audit.finding_reopened', finding.id)
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


