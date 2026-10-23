import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { z } from 'zod'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
import { validateStepValue } from '../lib/stepValidation'

const router: ExpressRouter = Router()

const submitStepSchema = z.object({
  value: z.any(),
})

const PLATFORM_ADMINS = ['super_admin', 'technical_admin']
/** Statuts dans lesquels l'exécutant peut encore saisir des étapes. */
const EXECUTABLE = ['assigned', 'in_progress']

// Soumettre une étape d'action — validée côté serveur (type, règle, choix, garde-fous)
router.post('/:actionId/steps/:stepId/submit', requireAuth, requireTenant, requirePermission('action.submit'), async (req: AuthedRequest, res) => {
  const { actionId, stepId } = req.params
  const parsedBody = submitStepSchema.safeParse(req.body ?? {})
  if (!parsedBody.success) return res.status(400).json({ error: 'invalid payload', details: parsedBody.error.flatten() })
  const { value } = parsedBody.data

  const user = req.user
  if (!user) return res.status(401).json({ error: 'unauthenticated' })

  // Isolation tenant : une action inconnue ou d'un autre tenant est indiscernable (404)
  const { data: action } = await supabaseAdmin
    .from('actions')
    .select('id, tenant_id, action_def_id, assigned_to, status, started_at')
    .eq('id', actionId)
    .eq('tenant_id', user.tenant_id!)
    .maybeSingle()
  if (!action) return res.status(404).json({ error: 'action not found' })

  // Seul l'exécutant assigné saisit ses étapes (les rôles plateforme exceptés).
  // Un utilisateur qui ne voit pas l'action (ni assigné, ni gestionnaire) reçoit 404, comme en lecture.
  const privileged = PLATFORM_ADMINS.includes(user.role ?? '')
  if (action.assigned_to !== user.id && !privileged && !(req.permissions?.has('action.assign') ?? false)) {
    return res.status(404).json({ error: 'action not found' })
  }
  if (action.assigned_to !== user.id && !privileged) {
    return res.status(403).json({ error: "action non assignée à l'utilisateur", code: 'ERR_NOT_ASSIGNEE' })
  }
  if (!EXECUTABLE.includes(action.status)) {
    return res.status(409).json({ error: `saisie impossible : statut ${action.status}`, code: 'ERR_ACTION_STATUS' })
  }

  // L'étape doit appartenir à la définition de CETTE action
  const { data: step } = await supabaseAdmin
    .from('workflow_steps')
    .select('id, step_type, required, validation_rule, choices, guardrails')
    .eq('id', stepId)
    .eq('action_id', action.action_def_id)
    .maybeSingle()
  if (!step) return res.status(404).json({ error: 'step not found in this action' })

  const check = validateStepValue(step, value)
  if (!check.ok) return res.status(422).json({ error: check.message, code: check.code })

  // Première saisie : l'action démarre (assigned → in_progress)
  if (action.status === 'assigned') {
    await supabaseAdmin
      .from('actions')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', action.id)
      .eq('status', 'assigned')
  }

  const { data, error } = await supabaseAdmin
    .from('step_submissions')
    .upsert(
      {
        action_id: actionId,
        step_id: stepId,
        tenant_id: user.tenant_id,
        value: check.value,
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'action_id,step_id' },
    )
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  await writeAudit({
    tenantId: user.tenant_id!,
    actorId: user.id,
    action: 'step.submit',
    entity: 'step_submission',
    entityId: data.id,
    payload: { action_id: actionId, step_id: stepId },
  })

  res.json({ submission: data })
})

// Les preuves ne passent plus par cette route : fichiers → POST /evidence/upload,
// mesures et textes → POST /evidence (avec step_id). Voir routes/evidence.ts.

export const stepsRouter: ExpressRouter = router
