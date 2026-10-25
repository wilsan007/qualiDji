import type { WorkflowStep } from '@/types'

/**
 * Garde-fou « require_justification » (même grammaire que le serveur) : renvoie la longueur
 * minimale de justification exigée pour ce choix, ou null si aucune. Le serveur reste l'autorité.
 */
export function justificationRequired(step: WorkflowStep, choice: string | null): number | null {
  if (!choice) return null
  for (const g of step.guardrails ?? []) {
    if (g?.action !== 'require_justification' || typeof g.condition !== 'string') continue
    const m = /^\s*choice\s*(==|!=)\s*'([^']*)'\s*$/.exec(g.condition)
    if (!m) continue
    const hit = m[1] === '==' ? choice === m[2] : choice !== m[2]
    if (hit) return typeof g.min_length === 'number' ? g.min_length : 1
  }
  return null
}
