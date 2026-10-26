/**
 * Tests unitaires — validation serveur des saisies d'étapes (workflow engine).
 * Reprend les 4 étapes de WF_CONTEXT_ANALYSIS (seed 0001) + les autres types.
 * Exécution : npm run test:steps
 */
import { validateStepValue, isSupportedGuardrail, isSupportedValidationRule, StepDef } from '../src/lib/stepValidation'

let passed = 0
let failed = 0
function assert(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const code = (r: ReturnType<typeof validateStepValue>) => (r.ok ? 'OK' : r.code)

const step = (over: Partial<StepDef>): StepDef => ({
  id: 'S', step_type: 'text_input', required: true, validation_rule: null, choices: null, guardrails: [], ...over,
})

// Seed : ST_CTX_001_01 / 02 (texte, min_length:50)
const ctx = step({ validation_rule: 'min_length:50' })
console.log('— texte + min_length —')
assert('texte trop court → ERR_STEP_RULE', code(validateStepValue(ctx, 'court')) === 'ERR_STEP_RULE')
assert('espaces ne comptent pas', code(validateStepValue(ctx, ' '.repeat(60) + 'abc')) === 'ERR_STEP_RULE')
assert('texte ≥ 50 → OK', code(validateStepValue(ctx, 'x'.repeat(50))) === 'OK')
assert('nombre au lieu de texte → ERR_STEP_TYPE', code(validateStepValue(ctx, 12345)) === 'ERR_STEP_TYPE')
assert('vide + requis → ERR_STEP_REQUIRED_VALUE', code(validateStepValue(ctx, '')) === 'ERR_STEP_REQUIRED_VALUE')
assert('undefined + requis → ERR_STEP_REQUIRED_VALUE', code(validateStepValue(ctx, undefined)) === 'ERR_STEP_REQUIRED_VALUE')
assert('vide + optionnel → OK (null)', (() => { const r = validateStepValue(step({ required: false }), ''); return r.ok && r.value === null })())
assert('valeur > 20 000 caractères → ERR_STEP_VALUE', code(validateStepValue(step({}), 'x'.repeat(20_001))) === 'ERR_STEP_VALUE')

// Seed : ST_CTX_001_03 (choix + garde-fou justification ≥ 100 si non_pertinent)
const climate = step({
  step_type: 'choice',
  choices: ['pertinent', 'non_pertinent', 'a_evaluer'],
  guardrails: [{ condition: "choice == 'non_pertinent'", action: 'require_justification', min_length: 100 }],
})
console.log('— choix + garde-fou —')
assert('choix hors liste → ERR_STEP_CHOICE', code(validateStepValue(climate, 'bogus')) === 'ERR_STEP_CHOICE')
assert('pertinent (sans justification) → OK', code(validateStepValue(climate, 'pertinent')) === 'OK')
assert('non_pertinent sans justification → ERR_GUARDRAIL_JUSTIFICATION', code(validateStepValue(climate, 'non_pertinent')) === 'ERR_GUARDRAIL_JUSTIFICATION')
assert('non_pertinent + justification 20 car. → refusé', code(validateStepValue(climate, { choice: 'non_pertinent', justification: 'x'.repeat(20) })) === 'ERR_GUARDRAIL_JUSTIFICATION')
const okJ = validateStepValue(climate, { choice: 'non_pertinent', justification: 'j'.repeat(100) })
assert('non_pertinent + justification 100 car. → OK et conservée', okJ.ok && (okJ.value as any).choice === 'non_pertinent' && (okJ.value as any).justification.length === 100)
assert("enveloppe avec choix invalide → ERR_STEP_CHOICE", code(validateStepValue(climate, { choice: 'x', justification: 'j'.repeat(200) })) === 'ERR_STEP_CHOICE')
assert('choix objets {value,label} supportés', code(validateStepValue(step({ step_type: 'choice', choices: [{ value: 'a', label: 'A' }] }), 'a')) === 'OK')
assert("condition '!=' : déclenche hors valeur", code(validateStepValue(step({
  step_type: 'choice', choices: ['ok', 'ko'], guardrails: [{ condition: "choice != 'ok'", action: 'require_justification' }],
}), 'ko')) === 'ERR_GUARDRAIL_JUSTIFICATION')
assert('garde-fou non supporté → échec fermé', code(validateStepValue(step({
  step_type: 'choice', choices: ['a'], guardrails: [{ condition: 'x > 3', action: 'block' }],
}), 'a')) === 'ERR_GUARDRAIL_UNSUPPORTED')

console.log('— étape d\'approbation —')
assert("approval jamais saisissable", code(validateStepValue(step({ step_type: 'approval' }), 'approved')) === 'ERR_STEP_APPROVAL')

console.log('— autres types —')
const num = step({ step_type: 'number_input', validation_rule: 'min:0' })
assert('nombre ≥ min → OK', code(validateStepValue(num, 5)) === 'OK')
assert('nombre < min → ERR_STEP_RULE', code(validateStepValue(num, -1)) === 'ERR_STEP_RULE')
assert('chaîne numérique refusée', code(validateStepValue(num, '5')) === 'ERR_STEP_TYPE')
assert('NaN refusé', code(validateStepValue(num, NaN)) === 'ERR_STEP_REQUIRED_VALUE' || code(validateStepValue(num, NaN)) === 'ERR_STEP_TYPE')
assert('max respecté', code(validateStepValue(step({ step_type: 'number_input', validation_rule: 'max:10' }), 11)) === 'ERR_STEP_RULE')
assert('checkbox booléen', code(validateStepValue(step({ step_type: 'checkbox' }), true)) === 'OK' && code(validateStepValue(step({ step_type: 'checkbox' }), 'oui')) === 'ERR_STEP_TYPE')
assert('confirmation requise doit être true', code(validateStepValue(step({ step_type: 'confirmation' }), false)) === 'ERR_STEP_TYPE' && code(validateStepValue(step({ step_type: 'confirmation' }), true)) === 'OK')
assert('date valide / invalide', code(validateStepValue(step({ step_type: 'date' }), '2026-10-23')) === 'OK' && code(validateStepValue(step({ step_type: 'date' }), '23/10/2026')) === 'ERR_STEP_TYPE')
assert('date inexistante refusée', code(validateStepValue(step({ step_type: 'date' }), '2026-13-45')) === 'ERR_STEP_TYPE')
assert('sensor_value numérique ou {value}', code(validateStepValue(step({ step_type: 'sensor_value' }), 21.5)) === 'OK' && code(validateStepValue(step({ step_type: 'sensor_value' }), { value: 3 })) === 'OK' && code(validateStepValue(step({ step_type: 'sensor_value' }), 'chaud')) === 'ERR_STEP_TYPE')
assert('photo : référence texte ou objet', code(validateStepValue(step({ step_type: 'photo' }), { filename: 'a.jpg' })) === 'OK' && code(validateStepValue(step({ step_type: 'photo' }), 42)) === 'ERR_STEP_TYPE')
assert("type d'étape inconnu → ERR_STEP_TYPE", code(validateStepValue(step({ step_type: 'telepathie' }), 'x')) === 'ERR_STEP_TYPE')

console.log('— grammaire acceptée à la création —')
assert('règles valides', ['min_length:50', 'max_length:200', 'min:0', 'max:12.5', 'min:-3'].every(isSupportedValidationRule))
assert('règles invalides', !['regex:^a', 'min_length:abc', 'longueur>5', ''].some(isSupportedValidationRule))
assert('garde-fou valide sur choice', isSupportedGuardrail({ condition: "choice == 'x'", action: 'require_justification', min_length: 10 }, 'choice'))
assert('garde-fou invalide : mauvais type d\'étape / action / min_length', !isSupportedGuardrail({ condition: "choice == 'x'", action: 'require_justification' }, 'text_input') && !isSupportedGuardrail({ condition: "choice == 'x'", action: 'block' }, 'choice') && !isSupportedGuardrail({ condition: "choice == 'x'", action: 'require_justification', min_length: 0 }, 'choice'))

console.log(`\nRésultat étapes : ${passed} réussis, ${failed} échec(s).`)
if (failed > 0) process.exit(1)
