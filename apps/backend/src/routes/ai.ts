import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { z } from 'zod'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import {
  applyRulesAndValidate, buildSystemPrompt, buildTemplateGuidance, buildUserPrompt,
  confidenceToNumeric, CorpusSource, detectInjection, StepLike,
} from '../lib/aiGuard'
import { callProvider, getCircuitBreaker, sha256 } from '../lib/aiProvider'

/**
 * §7 Assistant IA — pipeline obligatoire (§7.3) et règles R1-R10 (§7.5).
 * L'IA explique des étapes EXISTANTES d'un workflow publié : elle ne décide
 * rien, n'ajoute aucune étape, n'invente aucun seuil et n'approuve jamais
 * (suggestions = contenu non approuvé, validation humaine requise).
 */
const router: ExpressRouter = Router()

const guidanceInput = z.object({
  actionId: z.string().min(1),
  stepId: z.string().min(1).optional(),
  context: z.record(z.any()).default({}),
})

/** RAG-lite (§7.6) : corpus = référentiel global (requirements liés à la clause). */
async function buildCorpus(clause: string | null): Promise<CorpusSource[]> {
  const { data } = await supabaseAdmin
    .from('requirements')
    .select('id, clause, title, source_ref')
    .limit(30)
  const rows = (data ?? []).filter((r) =>
    clause ? String(r.clause ?? '').startsWith(clause.split('.')[0] ?? '') : true
  )
  return rows.slice(0, 5).map((r) => ({
    object_type: 'control',
    object_id: r.id,
    title: r.title ?? r.id,
    excerpt: r.source_ref ?? '',
    version: 1,
  }))
}

router.post(
  '/guidance',
  requireAuth,
  requireTenant,
  requirePermission('action.execute'),
  async (req: AuthedRequest, res) => {
    const parsed = guidanceInput.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() })
    const { actionId, stepId, context } = parsed.data
    const tenantId = req.user!.tenant_id!

    // ── §7.3.1 : accès à l'action — uniquement les workflows PUBLIÉS ────────
    const { data: action } = await supabaseAdmin
      .from('workflow_actions')
      .select('*, workflow_definitions(*), workflow_steps(*)')
      .eq('id', actionId)
      .single()
    if (!action || (action.workflow_definitions as any)?.status !== 'published') {
      return res.status(404).json({ error: 'action not found (workflow non publié)' })
    }
    const steps: StepLike[] = ((action.workflow_steps as any[]) ?? [])
      .sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map((s) => ({
        id: s.id,
        title: s.title,
        instruction: s.instruction,
        step_type: s.step_type,
        validation_rule: s.validation_rule,
        guardrails: s.guardrails,
      }))
    if (stepId && !steps.some((s) => s.id === stepId)) {
      return res.status(404).json({ error: 'step not found in this action' })
    }

    // ── R8 : le contexte utilisateur est une DONNÉE non fiable ──────────────
    const contextText = JSON.stringify(context ?? {})
    const scan = detectInjection(contextText)
    if (scan.injected) {
      void supabaseAdmin.from('ai_interventions').insert({
        tenant_id: tenantId,
        action_def_id: actionId,
        step_id: stepId ?? null,
        prompt_text: '(rejetée avant envoi — injection détectée)',
        context: {},
        response: {},
        status: 'rejected',
        result_status: 'rejected_injection',
        input_hash: sha256(contextText),
        ai_meta: { matched: scan.matched },
      })
      return res.status(400).json({
        error: 'instruction non autorisée détectée dans le contexte (R8) — requête journalisée',
        code: 'ERR_AI_INJECTION',
      })
    }

    // ── §7.3.2-3 : contexte minimal + corpus (R7 : filtré serveur) ─────────
    const wf = action.workflow_definitions as any
    const corpus = await buildCorpus(wf?.standard_clause ?? null)
    const validSourceIds = new Set<string>([
      ...corpus.map((c) => c.object_id),
      ...steps.map((s) => s.id),
    ])
    const allowedStepIds = new Set(steps.map((s) => s.id))

    // R5 : version du prompt = hash du template associé à la première step
    const templateId = (action.workflow_steps as any[])[0]?.ai_prompt_template ?? null
    let promptVersion: string | null = null
    if (templateId) {
      const { data: tpl } = await supabaseAdmin
        .from('ai_prompt_templates')
        .select('template')
        .eq('id', templateId)
        .single()
      if (tpl?.template) promptVersion = sha256(tpl.template).slice(0, 12)
    }

    // ── §7.3.4 : appel fournisseur via interface abstraite (§7.7) ──────────
    const inputHash = sha256(contextText + actionId + (stepId ?? ''))
    const startedAt = Date.now()
    const called = await callProvider({
      system: buildSystemPrompt(),
      user: buildUserPrompt(actionId, action.title, steps, corpus),
      schemaHint: 'aiResponseContract/1.0',
    })

    let degraded = false
    let resultStatus: 'ok' | 'degraded' | 'error' = 'ok'
    let model = 'template-fallback'
    let latencyMs = Date.now() - startedAt
    const scopedSteps = stepId ? steps.filter((s) => s.id === stepId) : steps
    let aiResponse = buildTemplateGuidance(actionId, scopedSteps, corpus)
    const ruleWarnings: string[] = []
    let rejectedSteps: string[] = []
    let schemaOk = true

    if (called) {
      model = called.result.model
      latencyMs = called.result.latencyMs
      try {
        const raw = JSON.parse(called.result.text)
        const outcome = applyRulesAndValidate(raw, { allowedStepIds, validSourceIds })
        if (outcome.ok) {
          // Suggestions = contenu NON APPROUVÉ ; R10 : aucune action automatique
          aiResponse = { ...outcome.value, action_id: actionId, step_id: stepId ?? null }
          ruleWarnings.push(...outcome.value.warnings)
        } else {
          schemaOk = false
          degraded = true
          resultStatus = 'error'
          ruleWarnings.push(`Réponse fournisseur rejetée (${outcome.error}) — mode standard activé (R6).`)
        }
      } catch {
        schemaOk = false
        degraded = true
        resultStatus = 'error'
        ruleWarnings.push('Réponse fournisseur illisible — mode standard activé (R6).')
      }
    } else if (getCircuitBreaker().isOpen) {
      degraded = true
      resultStatus = 'degraded'
      ruleWarnings.push('Fournisseur IA indisponible (circuit ouvert) — mode standard activé (R6).')
    }

    aiResponse.warnings = [...(aiResponse.warnings ?? []), ...ruleWarnings]
    aiResponse.requires_human_review = true
    const outputHash = sha256(JSON.stringify(aiResponse))

    // ── R5 : journal d'interaction (modèle, hashes, latence, résultat) ─────
    const { data: intervention } = await supabaseAdmin
      .from('ai_interventions')
      .insert({
        tenant_id: tenantId,
        action_def_id: actionId,
        step_id: stepId ?? null,
        prompt_template_id: templateId,
        prompt_text: JSON.stringify({ actionId, stepId, context: Object.keys(context ?? {}) }),
        context: {},
        response: aiResponse,
        micro_steps: aiResponse.guidance,
        sources: aiResponse.guidance.flatMap((g) => g.source_refs),
        confidence: confidenceToNumeric(aiResponse.confidence_label),
        status: 'draft',
        model,
        prompt_version: promptVersion,
        input_hash: inputHash,
        output_hash: outputHash,
        latency_ms: latencyMs,
        result_status: resultStatus,
        degraded,
        ai_meta: { schema_ok: schemaOk, warnings: aiResponse.warnings, rejected_steps: rejectedSteps, provider: model },
      })
      .select('id')
      .single()

    // §7.3.9-10 : suggestions NON APPROUVÉES + mode standard si échec
    res.json({
      ...aiResponse,
      approved: false,
      degraded,
      model,
      latencyMs,
      interventionId: intervention?.id ?? null,
    })
  }
)

// ── R5 : traçabilité — journal des interactions (audit.export) ──────────────
router.get('/interventions', requireAuth, requireTenant, requirePermission('audit.export'), async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from('ai_interventions')
    .select('id, action_def_id, step_id, model, prompt_version, latency_ms, result_status, degraded, status, created_at, ai_meta')
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ interventions: data ?? [] })
})

export const aiRouter: ExpressRouter = router


