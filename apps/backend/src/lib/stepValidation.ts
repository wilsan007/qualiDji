/**
 * Validation SERVEUR des saisies d'étapes (workflow engine, V5 §5.3).
 * Jusqu'ici seul le navigateur contrôlait `min_length`. Le serveur est
 * l'autorité : type de la valeur, règle de validation, choix autorisés et
 * garde-fous (guardrails) de la définition publiée.
 *
 * Grammaire supportée — volontairement fermée :
 *   validation_rule : min_length:N | max_length:N | min:N | max:N
 *   guardrail       : { condition: "choice == 'x'" | "choice != 'x'",
 *                       action: "require_justification", min_length?: N }
 * Une règle inconnue sur une définition déjà publiée n'est jamais ignorée
 * pour un garde-fou (échec fermé, ERR_GUARDRAIL_UNSUPPORTED) ; pour une
 * validation_rule inconnue elle est sans effet, mais la création de workflow
 * refuse désormais toute grammaire hors liste (cf. isSupported*).
 */

export interface StepDef {
  id: string
  step_type: string
  required: boolean
  validation_rule: string | null
  choices: unknown
  guardrails: unknown
}

export type StepCheck =
  | { ok: true; value: unknown }
  | { ok: false; code: string; message: string }

const MAX_VALUE_CHARS = 20_000

const RULE_RE = /^(min_length|max_length|min|max):(-?\d+(?:\.\d+)?)$/
const COND_RE = /^\s*(choice)\s*(==|!=)\s*'([^']*)'\s*$/

export function isSupportedValidationRule(rule: string): boolean {
  return RULE_RE.test(rule.trim())
}

export function isSupportedGuardrail(g: unknown, stepType: string): boolean {
  if (typeof g !== 'object' || g === null) return false
  const o = g as Record<string, unknown>
  if (stepType !== 'choice') return false
  if (o.action !== 'require_justification') return false
  if (typeof o.condition !== 'string' || !COND_RE.test(o.condition)) return false
  if (o.min_length !== undefined && !(Number.isInteger(o.min_length) && (o.min_length as number) >= 1 && (o.min_length as number) <= 2000)) return false
  return true
}

function fail(code: string, message: string): StepCheck {
  return { ok: false, code, message }
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

function applyRule(rule: string | null, primary: unknown): StepCheck | null {
  if (!rule) return null
  const m = RULE_RE.exec(rule.trim())
  if (!m) return null
  const n = Number(m[2])
  if (typeof primary === 'string') {
    if (m[1] === 'min_length' && primary.trim().length < n) return fail('ERR_STEP_RULE', `au moins ${n} caractères requis`)
    if (m[1] === 'max_length' && primary.length > n) return fail('ERR_STEP_RULE', `au plus ${n} caractères autorisés`)
  }
  if (typeof primary === 'number') {
    if (m[1] === 'min' && primary < n) return fail('ERR_STEP_RULE', `valeur minimale ${n}`)
    if (m[1] === 'max' && primary > n) return fail('ERR_STEP_RULE', `valeur maximale ${n}`)
  }
  return null
}

function choiceList(choices: unknown): string[] {
  if (!Array.isArray(choices)) return []
  return choices
    .map((c) => (typeof c === 'string' ? c : typeof c === 'object' && c !== null ? String((c as any).value ?? '') : ''))
    .filter(Boolean)
}

export function validateStepValue(step: StepDef, raw: unknown): StepCheck {
  if (step.step_type === 'approval') {
    return fail('ERR_STEP_APPROVAL', "une étape d'approbation ne se saisit pas : elle est tranchée par l'approbateur (POST /actions/:id/approve)")
  }
  let size = 0
  try { size = JSON.stringify(raw ?? null).length } catch { return fail('ERR_STEP_VALUE', 'valeur non sérialisable') }
  if (size > MAX_VALUE_CHARS) return fail('ERR_STEP_VALUE', `valeur trop volumineuse (> ${MAX_VALUE_CHARS} caractères)`)

  // Enveloppe { choice, justification } pour les étapes à choix
  let primary: unknown = raw
  let justification: string | null = null
  if (step.step_type === 'choice' && typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    primary = (raw as any).choice
    const j = (raw as any).justification
    justification = typeof j === 'string' ? j.trim() : null
  }

  if (isBlank(primary)) {
    if (step.required) return fail('ERR_STEP_REQUIRED_VALUE', 'une réponse est obligatoire pour cette étape')
    return { ok: true, value: null }
  }

  switch (step.step_type) {
    case 'instruction':
      return { ok: true, value: true }
    case 'text_input':
    case 'knowledge_question':
      if (typeof primary !== 'string') return fail('ERR_STEP_TYPE', 'texte attendu')
      break
    case 'number_input':
      if (typeof primary !== 'number' || !Number.isFinite(primary)) return fail('ERR_STEP_TYPE', 'nombre attendu')
      break
    case 'sensor_value': {
      const v = typeof primary === 'object' && primary !== null ? (primary as any).value : primary
      if (typeof v !== 'number' || !Number.isFinite(v)) return fail('ERR_STEP_TYPE', 'valeur numérique attendue')
      break
    }
    case 'checkbox':
      if (typeof primary !== 'boolean') return fail('ERR_STEP_TYPE', 'booléen attendu')
      break
    case 'confirmation':
      if (primary !== true && step.required) return fail('ERR_STEP_TYPE', 'confirmation explicite (true) attendue')
      if (typeof primary !== 'boolean') return fail('ERR_STEP_TYPE', 'booléen attendu')
      break
    case 'date':
      if (typeof primary !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(primary) || Number.isNaN(Date.parse(primary))) {
        return fail('ERR_STEP_TYPE', 'date ISO attendue (AAAA-MM-JJ)')
      }
      break
    case 'choice': {
      const allowed = choiceList(step.choices)
      if (typeof primary !== 'string' || !allowed.includes(primary)) {
        return fail('ERR_STEP_CHOICE', `choix invalide (autorisés : ${allowed.join(', ') || 'aucun'})`)
      }
      break
    }
    case 'signature':
    case 'photo':
    case 'file_upload':
    case 'barcode':
    case 'qr_scan':
    case 'location_check':
      if (!(typeof primary === 'string' || (typeof primary === 'object' && primary !== null))) {
        return fail('ERR_STEP_TYPE', 'référence (texte ou objet) attendue')
      }
      break
    default:
      return fail('ERR_STEP_TYPE', `type d'étape inconnu : ${step.step_type}`)
  }

  const ruleError = applyRule(step.validation_rule, primary)
  if (ruleError) return ruleError

  // Garde-fous : échec FERMÉ si non évaluable
  if (Array.isArray(step.guardrails)) {
    for (const g of step.guardrails) {
      if (!isSupportedGuardrail(g, step.step_type)) {
        return fail('ERR_GUARDRAIL_UNSUPPORTED', "garde-fou non évaluable par le serveur — soumission refusée, à corriger dans la définition du workflow")
      }
      const gg = g as { condition: string; min_length?: number }
      const m = COND_RE.exec(gg.condition)!
      const matches = m[2] === '==' ? primary === m[3] : primary !== m[3]
      if (matches) {
        const need = gg.min_length ?? 1
        if (!justification || justification.length < need) {
          return fail('ERR_GUARDRAIL_JUSTIFICATION', `justification d'au moins ${need} caractères obligatoire pour ce choix`)
        }
      }
    }
  }

  const value = justification ? { choice: primary, justification } : primary
  return { ok: true, value }
}
