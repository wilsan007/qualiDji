import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { z } from 'zod'
import { requireAuth, requireTenant, requirePermission, requireAnyPermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'

const router: ExpressRouter = Router()

// Liste des actions assignées à l'utilisateur connecté
router.get('/assigned', requireAuth, requireTenant, requirePermission('action.read'), async (req: AuthedRequest, res) => {
  const user = req.user
  if (!user) return res.status(401).json({ error: 'unauthenticated' })
  const { status, limit = '50', offset = '0' } = req.query as Record<string, string>

  let query = supabaseAdmin
    .from('actions')
    .select('*, workflow_definitions(*), workflow_actions(*)')
    .eq('tenant_id', user.tenant_id)
    .order('created_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1)

  if (status) {
    query = query.eq('status', status)
  }
  // Si opérateur, filtrer sur ses actions assignées (sinon qualité voit tout le tenant)
  if (user.role === 'operator' || user.role === 'process_owner') {
    query = query.eq('assigned_to', user.id)
  }

  const { data, error } = await query
  if (error) return res.status(400).json({ error: error.message })
  res.json({ actions: data ?? [] })
})

// Détail d'une action
router.get('/:id', requireAuth, requireTenant, requirePermission('action.read'), async (req: AuthedRequest, res) => {
  const user = req.user
  if (!user) return res.status(401).json({ error: 'unauthenticated' })
  const { id } = req.params
  const { data, error } = await supabaseAdmin
    .from('actions')
    .select('*, workflow_definitions(*), workflow_actions(*), step_submissions(*, workflow_steps(*))')
    .eq('id', id)
    .single()
  if (error || !data) return res.status(404).json({ error: 'action not found' })
  if (data.tenant_id !== user.tenant_id) {
    return res.status(403).json({ error: 'tenant isolation' })
  }
  res.json({ action: data })
})

// Démarrer une action
const startSchema = z.object({})
router.post('/:id/start', requireAuth, requireTenant, requirePermission('action.execute'), async (req: AuthedRequest, res) => {
  const user = req.user
  if (!user) return res.status(401).json({ error: 'unauthenticated' })
  const { id } = req.params
  const { data: action, error } = await supabaseAdmin
    .from('actions')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .select()
    .single()
  if (error || !action) return res.status(404).json({ error: 'action not found' })
  res.json({ action })
})

// Soumettre une action (toutes les steps)
router.post('/:id/submit', requireAuth, requireTenant, requirePermission('action.submit'), async (req: AuthedRequest, res) => {
  const user = req.user
  if (!user) return res.status(401).json({ error: 'unauthenticated' })
  const { id } = req.params
  const { data: action, error } = await supabaseAdmin
    .from('actions')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .select()
    .single()
  if (error || !action) return res.status(404).json({ error: 'action not found' })
  res.json({ action })
})

// Bloquer une action (guardrail)
router.post('/:id/block', requireAuth, requireTenant, requireAnyPermission(['action.execute', 'action.approve']), async (req: AuthedRequest, res) => {
  const user = req.user
  if (!user) return res.status(401).json({ error: 'unauthenticated' })
  const { id } = req.params
  const { data: action, error } = await supabaseAdmin
    .from('actions')
    .update({ status: 'blocked' })
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .select()
    .single()
  if (error || !action) return res.status(404).json({ error: 'action not found' })
  res.json({ action })
})

// Déclarer une exception sur une action (→ NC)
router.post('/:id/exception', requireAuth, requireTenant, requireAnyPermission(['action.execute', 'action.approve']), async (req: AuthedRequest, res) => {
  const user = req.user
  if (!user) return res.status(401).json({ error: 'unauthenticated' })
  const { id } = req.params
  const { reason, severity = 'minor' } = req.body as { reason?: string; severity?: string }

  if (!reason) return res.status(400).json({ error: 'reason required' })

  const { data: action } = await supabaseAdmin
    .from('actions')
    .select('id, title')
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .single()
  if (!action) return res.status(404).json({ error: 'action not found' })

  const { data: nc, error } = await supabaseAdmin
    .from('nonconformities')
    .insert({
      tenant_id: user.tenant_id,
      action_id: id,
      title: `Exception sur action ${action?.title ?? id}`,
      severity,
      status: 'open',
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  await supabaseAdmin.from('actions').update({ status: 'blocked' }).eq('id', id).eq('tenant_id', user.tenant_id)

  res.status(201).json({ nonconformity: nc })
})

export const actionsRouter: ExpressRouter = router
