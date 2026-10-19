import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'

const router: ExpressRouter = Router()

router.get('/employee', requireAuth, requireTenant, requirePermission('action.read'), async (req: AuthedRequest, res) => {
  const { data } = await supabaseAdmin
    .from('actions')
    .select('id, status, workflow_actions(*), step_submissions(*)')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('assigned_to', req.user!.id)
    .order('created_at', { ascending: false })
  res.json({ actions: data ?? [] })
})

// Vue agrégée du tenant — supervision (lecture de toutes les actions : action.assign)
router.get('/manager', requireAuth, requireTenant, requirePermission('action.assign'), async (req: AuthedRequest, res) => {
  const { data } = await supabaseAdmin
    .from('actions')
    .select('id, status, assigned_to, workflow_actions(*), step_submissions(*)')
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false })
  res.json({ actions: data ?? [] })
})

// Vue qualité (NC + CAPA du tenant) — management qualité (action.approve)
router.get('/quality', requireAuth, requireTenant, requirePermission('action.approve'), async (req: AuthedRequest, res) => {
  const [ncs, capas] = await Promise.all([
    supabaseAdmin.from('nonconformities').select('*').eq('tenant_id', req.user!.tenant_id),
    supabaseAdmin.from('capas').select('*').eq('tenant_id', req.user!.tenant_id),
  ])
  res.json({ nonconformities: ncs.data ?? [], capas: capas.data ?? [] })
})

// Traçabilité audit pour la page « Prêt audit » — même exigence d'autorisation que le journal (audit.export)
router.get('/audit-readiness', requireAuth, requireTenant, requirePermission('audit.export'), async (req: AuthedRequest, res) => {
  const { data } = await supabaseAdmin
    .from('audit_log')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false })
    .limit(100)
  res.json({ events: data ?? [] })
})

export const dashboardRouter: ExpressRouter = router
