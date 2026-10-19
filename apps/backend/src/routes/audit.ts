import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'

const router: ExpressRouter = Router()

// Journal d'audit — consultation sensible réservée aux rôles porteurs d'audit.export (§3.3)
router.get('/', requireAuth, requireTenant, requirePermission('audit.export'), async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from('audit_log')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) return res.status(400).json({ error: error.message })
  res.json({ events: data ?? [] })
})

// Trace d'une preuve (chaîne de preuves)
router.get('/trace/:evidenceId', requireAuth, requireTenant, requirePermission('evidence.read'), async (req: AuthedRequest, res) => {
  const { evidenceId } = req.params
  const { data: ev } = await supabaseAdmin
    .from('evidence')
    .select('*')
    .eq('id', evidenceId)
    .eq('tenant_id', req.user!.tenant_id)
    .single()
  if (!ev) return res.status(404).json({ error: 'evidence not found' })

  const [validations, logs] = await Promise.all([
    supabaseAdmin.from('evidence').select('status, validated_by, validated_at').eq('id', evidenceId).single(),
    supabaseAdmin.from('audit_log').select('*').eq('entity_id', evidenceId).order('created_at', { ascending: true }),
  ])

  res.json({
    evidence: ev,
    validation: validations,
    audit_events: logs.data ?? [],
  })
})

export const auditRouter: ExpressRouter = router
