import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'

const router: ExpressRouter = Router()

// Paramètres du tenant courant — tenant.read (tous rôles tenant, migration 0007 ; super/technical_admin en bypass)
router.get('/me', requireAuth, requireTenant, requirePermission('tenant.read'), async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('id', req.user!.tenant_id)
    .single()
  if (error || !data) return res.status(404).json({ error: 'tenant not found' })
  res.json({ tenant: data })
})

export const tenantsRouter: ExpressRouter = router
