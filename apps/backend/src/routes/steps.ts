import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { z } from 'zod'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'

const router: ExpressRouter = Router()

const submitStepSchema = z.object({
  value: z.any(),
})

// Soumettre une étape d'action
router.post('/:actionId/steps/:stepId/submit', requireAuth, requireTenant, requirePermission('action.submit'), async (req: AuthedRequest, res) => {
  const { actionId, stepId } = req.params
  const { value } = submitStepSchema.parse(req.body)

  const user = req.user
  if (!user) return res.status(401).json({ error: 'unauthenticated' })

  // Vérifier l'action et le tenant
  const { data: action } = await supabaseAdmin
    .from('actions')
    .select('id, tenant_id')
    .eq('id', actionId)
    .single()
  if (!action || action.tenant_id !== user.tenant_id) {
    return res.status(403).json({ error: 'tenant isolation' })
  }

  const { data, error } = await supabaseAdmin
    .from('step_submissions')
    .upsert({
      action_id: actionId,
      step_id: stepId,
      tenant_id: user.tenant_id,
      value,
      submitted_by: user.id,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  // Audit log
  await supabaseAdmin.from('audit_log').insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: 'step.submit',
    entity: 'step_submission',
    entity_id: data.id,
    payload: { action_id: actionId, step_id: stepId },
  })

  res.json({ submission: data })
})

// Joindre une preuve à une étape
router.post('/:actionId/steps/:stepId/evidence', requireAuth, requireTenant, requirePermission('evidence.upload'), async (req: AuthedRequest, res) => {
  const { actionId, stepId } = req.params
  const user = req.user
  if (!user) return res.status(401).json({ error: 'unauthenticated' })

  const { kind, storage_path, checksum, value } = req.body as {
    kind?: string
    storage_path?: string
    checksum?: string
    value?: any
  }

  if (!kind || !storage_path) {
    return res.status(400).json({ error: 'kind and storage_path required' })
  }

  // Isolation tenant : l'action parente doit appartenir au tenant de l'utilisateur
  const { data: action } = await supabaseAdmin
    .from('actions')
    .select('id, tenant_id')
    .eq('id', actionId)
    .single()
  if (!action || action.tenant_id !== user.tenant_id) {
    return res.status(403).json({ error: 'tenant isolation' })
  }

  const { data: sub } = await supabaseAdmin
    .from('step_submissions')
    .select('id')
    .eq('action_id', actionId)
    .eq('step_id', stepId)
    .single()

  const { data, error } = await supabaseAdmin.from('evidence').insert({
    tenant_id: user.tenant_id,
    action_id: actionId,
    step_submission_id: sub?.id ?? null,
    kind,
    storage_path,
    checksum,
    value,
    captured_by: user.id,
  })

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json({ evidence: data })
})

export const stepsRouter: ExpressRouter = router
