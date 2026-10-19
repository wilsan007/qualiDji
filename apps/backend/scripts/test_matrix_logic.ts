/**
 * Tests de logique — Matrice de traçabilité (Cahier des charges V4, annexes K & L)
 * Couvre: statuts normalisés L.4, lacunes bloquantes H-11/L.4, non-applicabilité
 * K.4, acceptation avec réserves K.5 et agrégations par clause / espace.
 * Exécution: pnpm --filter @iso/backend exec tsx scripts/test_matrix_logic.ts
 */
import { computeState, buildCoverage } from '../src/routes/matrix'

let failures = 0
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failures += 1
    console.error(`  ✗ ${name}`)
  }
}

const req = (over: Record<string, unknown> = {}): any => ({
  id: 'ISO9001-2026-7.2',
  clause: '7',
  title: 'Compétence',
  requirement_type: 'requirement',
  source_ref: '7.2',
  process_owner: 'RH / manager',
  software_control: 'Blocage d’affectation',
  objective_evidence: 'Matrice de compétences',
  verification_method: 'MT-7.2-POS / MT-7.2-NEG',
  spaces: ['C', 'P'],
  workflow_codes: ['WF_COMPETENCY_MANAGEMENT'],
  ...over,
})

const tests = (pos: string | null, neg: string | null): any => ({
  positive: pos ? { status: pos } : null,
  negative: neg ? { status: neg } : null,
})

const naValid: any = {
  applicability: 'not_applicable',
  na_justification: 'Hors périmètre de l’organisation',
  na_approved_by: 'Marie Dupont, RQ',
  na_approved_at: '2026-10-01T00:00:00Z',
}
const naInvalid: any = { applicability: 'not_applicable', na_justification: null, na_approved_by: null, na_approved_at: null }
const none = new Set<string>()

console.log('computeState — statuts normalisés (L.4)')

const tested = computeState(req(), null, tests('passed', 'passed'), none)
check('couple POS/NEG conforme → tested, non bloquant', tested.status === 'tested' && !tested.blocking)

const ready = computeState(req(), null, tests(null, null), none)
check('aucun test exécuté → ready_to_test et lacune bloquante', ready.status === 'ready_to_test' && ready.blocking)

const partial = computeState(req(), null, tests('passed', null), none)
check('test partiel → partially_covered et lacune bloquante', partial.status === 'partially_covered' && partial.blocking)

const failed = computeState(req(), null, tests('failed', 'passed'), none)
check('test en échec → partially_covered et lacune bloquante', failed.status === 'partially_covered' && failed.blocking)

const noOwner = computeState(req({ process_owner: null }), null, tests('passed', 'passed'), none)
check('sans responsable → not_covered et lacune bloquante (H-11)', noOwner.status === 'not_covered' && noOwner.blocking)

const noEvidence = computeState(req({ objective_evidence: null }), null, tests(null, null), none)
check('sans preuve → not_covered et lacune bloquante (H-11)', noEvidence.status === 'not_covered' && noEvidence.blocking)

const naOk = computeState(req(), naValid, tests(null, null), none)
check('NA justifiée + approuvée → not_applicable_justified, non bloquant', naOk.status === 'not_applicable_justified' && !naOk.blocking)

const naKo = computeState(req(), naInvalid, tests(null, null), none)
check('NA sans justification → not_covered et lacune bloquante (K.4)', naKo.status === 'not_covered' && naKo.blocking)

const toReview = computeState(req(), { applicability: 'to_review' } as any, tests(null, null), none)
check('applicabilité en revue → not_analyzed et lacune bloquante', toReview.status === 'not_analyzed' && toReview.blocking)

const withReserves = computeState(req(), null, tests('passed', 'passed'), new Set(['clause_7']))
check('validation avec réserves clause 7 → accepted_with_reserve', withReserves.status === 'accepted_with_reserve' && !withReserves.blocking)

const note = computeState(req({ requirement_type: 'note' }), null, tests(null, null), none)
check('type note → hors comptes applicables, non bloquant', note.blocking === false)

console.log('buildCoverage — agrégations par clause et par espace (L.4)')

const lines: any[] = [
  { ...req({ clause: '7' }), assessment: null, tests: tests('passed', 'passed'), gap_status: 'tested', blocking: false },
  {
    ...req({ clause: '7', id: 'ISO9001-2026-7.3', source_ref: '7.3' }),
    assessment: null,
    tests: tests(null, null),
    gap_status: 'ready_to_test',
    blocking: true,
  },
  {
    ...req({ clause: '4', id: 'ISO9001-2026-4.1', source_ref: '4.1', spaces: ['C', 'P'] }),
    assessment: naValid,
    tests: tests(null, null),
    gap_status: 'not_applicable_justified',
    blocking: false,
  },
  {
    ...req({ clause: '8', id: 'ISO9001-2026-8.6', source_ref: '8.6', spaces: ['P', 'AE'] }),
    assessment: null,
    tests: tests('passed', 'passed'),
    gap_status: 'tested',
    blocking: false,
  },
]

const cov = buildCoverage(lines)
const c7 = cov.clauses.find((b) => b.scope === '7')!
const c4 = cov.clauses.find((b) => b.scope === '4')!
const spaceC = cov.spaces.find((b) => b.scope === 'C')!
const spaceAE = cov.spaces.find((b) => b.scope === 'AE')!

check('clause 7: 2 applicables, 1 testé, 1 lacune bloquante', c7.applicable === 2 && c7.tested === 1 && c7.blocking_gaps === 1)
check('clause 4: NA justifiée comptée, 0 applicable', c4.applicable === 0 && c4.na_justified === 1 && c4.blocking_gaps === 0)
check('espace C: 7.2 + 7.3 applicables, 4.1 non applicable exclue', spaceC.applicable === 2)
check('espace AE: une seule exigence applicable (8.6)', spaceAE.applicable === 1)
check('totaux: 3 applicables, 2 testés, 1 lacune', cov.totals.applicable === 3 && cov.totals.tested === 2 && cov.totals.blocking_gaps === 1)
check('totaux: comptage tests + et −', cov.totals.tested_pos === 2 && cov.totals.tested_neg === 2)

if (failures > 0) {
  console.error(`\n${failures} échec(s).`)
  process.exit(1)
}
console.log('\nTous les tests de logique sont passés.')
