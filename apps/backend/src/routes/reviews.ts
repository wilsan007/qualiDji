import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { z } from 'zod'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { loadActionsReport, loadNcCapaReport } from './reports'
import { createHash } from 'crypto'
import { auditFromReq } from '../lib/audit'
import { dbFail } from '../lib/http'

/**
 * §9.3 Revues de direction (WF_MANAGEMENT_REVIEW) : entrées consolidées
 * (données enregistrées, pas de texte IA), décisions et actions tracées.
 * La tenue exige au minimum des entrées ET des décisions (§9.3).
 */
const router: ExpressRouter = Router()

const reviewInput = z.object({
  title: z.string().min(3).max(300),
  scheduled_at: z.string().datetime().nullable().optional(),
})

const updateInput = z.object({
  title: z.string().min(3).max(300).optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
  decisions: z.array(z.record(z.string(), z.any())).max(100).optional(),
  actions: z.array(z.record(z.string(), z.any())).max(100).optional(),
})

function auditLog(req: AuthedRequest, action: string, entityId: string, payload: Record<string, unknown> = {}) {
  return auditFromReq(req, action, 'management_review', entityId, payload)
}

/** Empreinte stable des entrées consolidées (M7) : calculée par le serveur à la consolidation, revérifiée à la tenue. */
export function inputsDigest(inputs: unknown): string {
  return createHash('sha256').update(canonicalJson(inputs ?? null)).digest('hex')
}

/** JSON à clés triées : jsonb ne conserve pas l'ordre des clés, l'empreinte doit y être insensible. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj).filter((k) => obj[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

// ── Liste ───────────────────────────────────────────────────────────────────
router.get('/', requireAuth, requireTenant, requirePermission('management_review.manage'), async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from('management_reviews').select('*').eq('tenant_id', req.user!.tenant_id!)
    .order('created_at', { ascending: false })
  if (error) return dbFail(res, error, 'reviews', 500)
  res.json({ reviews: data ?? [] })
})

// ── Création (brouillon) ────────────────────────────────────────────────────
router.post('/', requireAuth, requireTenant, requirePermission('management_review.manage'), async (req: AuthedRequest, res) => {
  const parsed = reviewInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() })
  const { data: review, error } = await supabaseAdmin
    .from('management_reviews')
    .insert({
      tenant_id: req.user!.tenant_id!, title: parsed.data.title,
      scheduled_at: parsed.data.scheduled_at ?? null, created_by: req.user!.id,
    })
    .select().single()
  if (error) return dbFail(res, error, 'reviews', 400)
  await auditLog(req, 'management_review.create', review.id)
  res.status(201).json({ review })
})

// ── Consolidation automatique des entrées (données enregistrées §5.8) ──────
router.post('/:id/prefill', requireAuth, requireTenant, requirePermission('management_review.manage'), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenant_id!
  const { data: review } = await supabaseAdmin.from('management_reviews').select('*').eq('tenant_id', tenantId).eq('id', req.params.id).single()
  if (!review) return res.status(404).json({ error: 'review not found' })
  if (review.status !== 'draft') return res.status(409).json({ error: 'modifiable uniquement en brouillon' })

  const actions = await loadActionsReport(tenantId, {})
  const ncCapa = await loadNcCapaReport(tenantId)
  const { count: auditTotal } = await supabaseAdmin.from('internal_audits').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
  const { count: auditClosed } = await supabaseAdmin.from('internal_audits').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'closed')

  const inputs = {
    generated_at: new Date().toISOString(),
    generated_by: req.user!.email ?? req.user!.id,
    source: 'données enregistrées (rapports §5.8) — aucun texte IA',
    actions: { total: actions.recorded.total, ...actions.computed },
    nc_capa: { total_nc: ncCapa.recorded.total_nc, total_capa: ncCapa.recorded.total_capa, ...ncCapa.computed },
    audits: { total: auditTotal ?? 0, closed: auditClosed ?? 0 },
  }
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin.from('management_reviews')
    .update({
      inputs, inputs_sha256: inputsDigest(inputs), prefilled_at: now, prefilled_by: req.user!.id, updated_at: now,
    }).eq('id', review.id).eq('status', 'draft')
  if (error) return dbFail(res, error, 'reviews', 400)
  await auditLog(req, 'management_review.prefill', review.id)
  res.json({ review: { ...review, inputs } })
})

// ── Édition (brouillon seul) : entrées, décisions, actions ─────────────────
router.put('/:id', requireAuth, requireTenant, requirePermission('management_review.manage'), async (req: AuthedRequest, res) => {
  const parsed = updateInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() })
  const { data: review } = await supabaseAdmin.from('management_reviews').select('*').eq('tenant_id', req.user!.tenant_id!).eq('id', req.params.id).single()
  if (!review) return res.status(404).json({ error: 'review not found' })
  if (review.status !== 'draft') return res.status(409).json({ error: `modifiable uniquement en brouillon (status: ${review.status})` })
  const input = parsed.data
  const { error } = await supabaseAdmin.from('management_reviews').update({
    ...(input.title ? { title: input.title } : {}),
    ...(input.scheduled_at !== undefined ? { scheduled_at: input.scheduled_at } : {}),
    ...(input.decisions !== undefined ? { decisions: input.decisions } : {}),
    ...(input.actions !== undefined ? { actions: input.actions } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', review.id).eq('status', 'draft')
  if (error) return dbFail(res, error, 'reviews', 400)
  await auditLog(req, 'management_review.update', review.id)
  const { data: updated } = await supabaseAdmin.from('management_reviews').select('*').eq('id', review.id).single()
  res.json({ review: updated })
})

// ── Tenue : exige entrées consolidées ET décisions (§9.3) ──────────────────
router.post('/:id/hold', requireAuth, requireTenant, requirePermission('management_review.manage'), async (req: AuthedRequest, res) => {
  const { data: review } = await supabaseAdmin.from('management_reviews').select('*').eq('tenant_id', req.user!.tenant_id!).eq('id', req.params.id).single()
  if (!review) return res.status(404).json({ error: 'review not found' })
  if (review.status !== 'draft') return res.status(409).json({ error: `cannot hold: status is ${review.status}` })
  // Les entrées ne peuvent venir que de /prefill (le PUT ne les accepte plus) ; l'empreinte scellée à la
  // consolidation est revérifiée : une valeur modifiée hors API invalide la tenue.
  const hasInputs = Boolean(review.prefilled_at) && Boolean(review.inputs) && Object.keys(review.inputs).length > 0
  const sealIntact = hasInputs && review.inputs_sha256 === inputsDigest(review.inputs)
  const hasDecisions = Array.isArray(review.decisions) && review.decisions.length > 0
  if (!hasInputs || !sealIntact || !hasDecisions) {
    return res.status(409).json({
      error: 'tenue impossible : entrées consolidées par le serveur (prefill, intactes) ET décisions obligatoires (§9.3)',
      code: hasInputs && !sealIntact ? 'ERR_INPUTS_TAMPERED' : 'ERR_REVIEW_INCOMPLETE',
      missing: { inputs: !hasInputs, inputs_integrity: hasInputs && !sealIntact, decisions: !hasDecisions },
    })
  }
  const now = new Date().toISOString()
  const { data: held, error } = await supabaseAdmin.from('management_reviews')
    .update({ status: 'held', held_at: now, updated_at: now }).eq('id', review.id).eq('status', 'draft').select('id')
  if (error) return dbFail(res, error, 'reviews', 400)
  if (!held?.length) return res.status(409).json({ error: "cannot hold: la revue a changé d'état" })
  await auditLog(req, 'management_review.hold', review.id, {
    decisions: (review.decisions as any[]).length, actions: (review.actions as any[]).length,
  })
  res.json({ review: { ...review, status: 'held', held_at: now } })
})

export const reviewsRouter: ExpressRouter = router

