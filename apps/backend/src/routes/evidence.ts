import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'

const router: ExpressRouter = Router()

// Créer une preuve (déjà possible via steps, mais endpoint dédié pour fichiers)
router.post('/', requireAuth, requireTenant, requirePermission('evidence.upload'), async (req: AuthedRequest, res) => {
  const { action_id, step_id, kind, storage_path, checksum, value } = req.body as {
    action_id?: string
    step_id?: string
    kind?: string
    storage_path?: string
    checksum?: string
    value?: any
  }

  if (!action_id || !kind || !storage_path) {
    return res.status(400).json({ error: 'action_id, kind and storage_path required' })
  }

  // Tenant isolation sur l'action
  const { data: action } = await supabaseAdmin
    .from('actions')
    .select('tenant_id')
    .eq('id', action_id)
    .single()
  if (!action || action.tenant_id !== req.user!.tenant_id) {
    return res.status(403).json({ error: 'tenant isolation' })
  }

  const { data, error } = await supabaseAdmin.from('evidence').insert({
    tenant_id: req.user!.tenant_id,
    action_id,
    step_id: step_id ?? null,
    kind,
    storage_path,
    checksum,
    value,
    captured_by: req.user!.id,
  })

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json({ evidence: data })
})

router.get('/:id', requireAuth, requireTenant, requirePermission('evidence.read'), async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from('evidence')
    .select('*')
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
    .single()
  if (error || !data) return res.status(404).json({ error: 'evidence not found' })
  res.json({ evidence: data })
})

// Suppression destructrice de la chaîne de preuves — réservée à l'autorité qualité
// (capa.close : tenant_admin, quality_manager) pour préserver l'intégrité de la traçabilité.
router.delete('/:id', requireAuth, requireTenant, requirePermission('capa.close'), async (req: AuthedRequest, res) => {
  const { error } = await supabaseAdmin
    .from('evidence')
    .delete()
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id)
  if (error) return res.status(400).json({ error: error.message })
  res.json({ ok: true })
})

export const evidenceRouter: ExpressRouter = router
