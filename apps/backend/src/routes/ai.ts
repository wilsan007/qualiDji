import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { z } from 'zod'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'

const router: ExpressRouter = Router()

const guidanceSchema = z.object({
  actionId: z.string(),
  stepId: z.string().optional(),
  context: z.record(z.any()).default({}),
})

// POST /ai/guidance — décomposition IA d'une action en micro-étapes
// L'IA ne crée jamais de workflow : elle retourne un guidage à partir du workflow métier existant.
// Guidage terrain = contexte d'exécution (§4.2 : assistant de l'exécutant) → action.execute
router.post('/guidance', requireAuth, requireTenant, requirePermission('action.execute'), async (req: AuthedRequest, res) => {
  const { actionId, stepId, context } = guidanceSchema.parse(req.body)

  // Récupérer l'action + ses steps depuis le workflow métier
  const { data: action } = await supabaseAdmin
    .from('workflow_actions')
    .select('*, workflow_definitions(*), workflow_steps(*)')
    .eq('id', actionId)
    .single()

  if (!action) return res.status(404).json({ error: 'action not found' })

  const steps = (action.workflow_steps as any[] ?? []).sort(
    (a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0)
  )

  // Construire le guidage à partir des steps définis (pas d'hallucination de seuil)
  const microSteps = steps.map((s, i) => ({
    sub_step: i + 1,
    step_id: s.id,
    title: s.title,
    instruction: s.instruction,
    step_type: s.step_type,
    required: s.required,
    validation_rule: s.validation_rule,
    evidence_requirement: s.evidence_requirement,
    ai_guidance_enabled: s.ai_guidance_enabled,
    prompt_template: s.ai_prompt_template,
    guardrails: s.guardrails ?? [],
    choices: s.choices,
    approver_role: s.approver_role,
    segregation_of_duties: s.segregation_of_duties,
  }))

  // Logger l'intervention IA (draft par défaut — R5 : human-in-the-loop)
  const { data: intervention } = await supabaseAdmin.from('ai_interventions').insert({
    tenant_id: req.user!.tenant_id,
    action_id: actionId,
    step_id: stepId ?? null,
    prompt_template_id: steps[0]?.ai_prompt_template ?? null,
    prompt_text: JSON.stringify({ actionId, stepId, context }),
    context,
    response: { microSteps, sources: [] },
    micro_steps: microSteps,
    sources: [],
    confidence: 1.0,
    status: 'draft',
  }).select().single()

  res.json({
    actionId,
    stepId,
    microSteps,
    sources: [],
    confidence: 1.0,
    interventionId: intervention?.id,
    note: 'Guidage généré depuis le workflow métier défini. Statut draft — validation RQ requise.',
  })
})

export const aiRouter: ExpressRouter = router
