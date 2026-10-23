import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { notifyByRoles } from '../lib/notify'
import { z } from 'zod'

const router: ExpressRouter = Router()

const capaInput = z.object({
  root_cause: z.string().max(4000).optional(),
  corrective_action: z.string().max(4000).optional(),
  responsible: z.string().max(200).optional(),
  // Date calendaire (champ <input type="date"> de l'interface) : AAAA-MM-JJ
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date attendu : AAAA-MM-JJ').optional(),
})

const effectivenessInput = z.object({
  effective: z.boolean(),
  comments: z.string().max(4000).optional(),
})

// Liste NC du tenant — lecture ouverte à tout rôle porteur d'action.read (registre qualité partagé §4.1)
router.get('/', requireAuth, requireTenant, requirePermission('action.read'), async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from('nonconformities')
    .select('*, capas(*)')
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false })
  if (error) return res.status(400).json({ error: error.message })
  // L'interface attend `nc.capa` : le plan CAPA le plus récent de la NC.
  const nonconformities = (data ?? []).map(({ capas, ...nc }) => {
    const sorted = [...(capas ?? [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    return { ...nc, capa: sorted[0] ?? null }
  })
  res.json({ nonconformities })
})

// Créer une NC — acte de décision réservé au management qualité (action.approve).
// L'exécutant signale un écart via POST /actions/:id/exception (action.execute).
router.post('/', requireAuth, requireTenant, requirePermission('action.approve'), async (req: AuthedRequest, res) => {
  const { title, severity, action_id } = req.body as {
    title?: string
    severity?: string
    action_id?: string
  }
  if (!title) return res.status(400).json({ error: 'title required' })

  const { data, error } = await supabaseAdmin.from('nonconformities').insert({
    tenant_id: req.user!.tenant_id,
    title,
    severity: severity ?? 'minor',
    status: 'open',
    action_id: action_id ?? null,
    created_by: req.user!.id,
  }).select().single()

  if (error) return res.status(400).json({ error: error.message })
  // Module G : NC ouverte — alerte qualité + admin tenant (hors créateur, §5.7)
  void notifyByRoles(['quality_manager', 'tenant_admin'], {
    tenantId: req.user!.tenant_id!,
    kind: 'nc.created',
    dedupeKey: `nc.created:${data.id}`,
    title: `Non-conformité ouverte : ${title}`,
    body: `Sévérité : ${severity ?? 'minor'}`,
    link: '/nc',
    entity: 'nonconformity',
    entityId: data.id,
    excludeUserIds: [req.user!.id],
  })
  res.status(201).json({ nonconformity: data })
})

// Lier une CAPA à une NC — gestion CAPA réservée à l'autorité qualité (capa.close)
router.post('/:id/capa', requireAuth, requireTenant, requirePermission('capa.close'), async (req: AuthedRequest, res) => {
  const { id } = req.params
  const parsed = capaInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid capa payload', details: parsed.error.flatten() })
  const { root_cause, corrective_action, responsible, due_date } = parsed.data

  // Isolation tenant : la NC parente doit appartenir au tenant de l'utilisateur
  const { data: nc } = await supabaseAdmin
    .from('nonconformities')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .single()
  if (!nc) return res.status(404).json({ error: 'nonconformity not found' })

  const { data, error } = await supabaseAdmin.from('capas').insert({
    tenant_id: req.user!.tenant_id,
    nonconformity_id: id,
    root_cause,
    corrective_action,
    responsible,
    due_date,
    status: 'open',
    created_by: req.user!.id,
  }).select().single()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json({ capa: data })
})

// Check d'efficacité d'une CAPA — vérification de clôture réservée à l'autorité qualité (capa.close)
router.post('/capas/:id/effectiveness-check', requireAuth, requireTenant, requirePermission('capa.close'), async (req: AuthedRequest, res) => {
  const { id } = req.params
  const parsed = effectivenessInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid payload (effective: boolean requis)', details: parsed.error.flatten() })
  const { effective, comments } = parsed.data

  const { data, error } = await supabaseAdmin
    .from('capas')
    .update({
      effectiveness_check_at: new Date().toISOString(),
      effectiveness_result: comments ?? (effective ? 'effective' : 'ineffective'),
      status: effective ? 'verified' : 'reopened',
    })
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .single()

  if (error || !data) return res.status(404).json({ error: 'capa not found' })
  res.json({ capa: data })
})

export const nonconformitiesRouter: ExpressRouter = router
