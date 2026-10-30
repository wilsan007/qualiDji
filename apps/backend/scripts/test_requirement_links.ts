/**
 * Tests unitaires — carte exigences ↔ workflows par entreprise (lib/requirementLinks.ts).
 * Hors ligne : aucune base, aucun réseau. Exécution : pnpm --filter @iso/backend test:links
 */
import {
  baseCode, buildEffectiveLinks, coversRequirement, familiesFromDefinitions, linkWarnings, NO_COVERAGE_WARNING,
  TenantLinkRow, WorkflowDef,
} from '../src/lib/requirementLinks'
import { computeState } from '../src/routes/matrix'

let passed = 0
let failed = 0
function assert(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const row = (over: Partial<TenantLinkRow> & Pick<TenantLinkRow, 'kind'>): TenantLinkRow => ({
  id: 'l1', requirement_id: 'ISO9001-2026-4.2', workflow_family: null, module: null,
  coverage_type: 'primary', reason: 'motif de test', created_at: '2026-10-29T08:00:00Z', ...over,
})
const defs: WorkflowDef[] = [
  { id: 'WF_CONTEXT_ANALYSIS', name: 'Analyse du contexte', status: 'published' },
  { id: 'WF_STAKEHOLDER_ANALYSIS__ab12cd34', name: 'Parties intéressées', status: 'draft' },
  { id: 'WF_SCOPE_DEFINITION__ab12cd34', name: 'Périmètre v1', status: 'published' },
  { id: 'WF_SCOPE_DEFINITION_V2__ab12cd34', name: 'Périmètre v2', status: 'draft' },
  { id: 'WF_OLD__ab12cd34', name: 'Ancien', status: 'deprecated' },
]
const families = familiesFromDefinitions(defs)

console.log('\n— Racine d’un code de workflow —')
{
  assert('code global inchangé', baseCode('WF_CONTEXT_ANALYSIS') === 'WF_CONTEXT_ANALYSIS')
  assert('suffixe tenant retiré', baseCode('WF_X__ab12cd34') === 'WF_X')
  assert('version retirée', baseCode('WF_X_V2') === 'WF_X')
  assert('version + suffixe tenant (ordre réel de workflows.ts)', baseCode('WF_X_V12__ab12cd34') === 'WF_X')
  assert('un « V » dans le nom n’est pas une version', baseCode('WF_CHECK_V__ab12cd34') === 'WF_CHECK_V')
}

console.log('\n— Familles : l’état le plus avancé gagne —')
{
  assert('publié + brouillon d’une même famille → publié', families.get('WF_SCOPE_DEFINITION')?.state === 'published')
  assert('brouillon seul → brouillon', families.get('WF_STAKEHOLDER_ANALYSIS')?.state === 'draft')
  assert('déprécié seul → déprécié', families.get('WF_OLD')?.state === 'deprecated')
  assert('workflow global publié', families.get('WF_CONTEXT_ANALYSIS')?.state === 'published')
  assert('famille inconnue absente', !families.has('WF_PROCESS_MAPPING'))
}

console.log('\n— Carte effective —')
{
  const none = buildEffectiveLinks(['WF_PROCESS_MAPPING'], [], families)
  assert('suggestion sans définition : état « missing », origine catalogue', none.links.length === 1 && none.links[0].state === 'missing' && none.links[0].origin === 'suggestion' && none.links[0].id === null)

  const pub = buildEffectiveLinks(['WF_CONTEXT_ANALYSIS'], [], families)
  assert('suggestion vers un workflow global publié : « published » avec son nom', pub.links[0].state === 'published' && pub.links[0].label === 'Analyse du contexte')

  const excl = buildEffectiveLinks(['WF_PROCESS_MAPPING'], [row({ id: 'x1', kind: 'exclusion', workflow_family: 'WF_PROCESS_MAPPING' })], families)
  assert('suggestion écartée : absente des liens, listée dans les exclusions avec son motif', excl.links.length === 0 && excl.excluded.length === 1 && excl.excluded[0].target === 'WF_PROCESS_MAPPING' && excl.excluded[0].reason === 'motif de test')

  const own = buildEffectiveLinks([], [row({ kind: 'workflow', workflow_family: 'WF_SCOPE_DEFINITION', coverage_type: 'supporting' })], families)
  assert('lien de l’entreprise vers sa famille publiée : origine « tenant », type conservé', own.links[0].origin === 'tenant' && own.links[0].state === 'published' && own.links[0].coverage_type === 'supporting' && own.links[0].id === 'l1')

  const mod = buildEffectiveLinks([], [row({ kind: 'module', module: 'audits' })], families)
  assert('lien vers un module : état « module », libellé lisible', mod.links[0].state === 'module' && mod.links[0].label === 'Audits internes')

  const dup = buildEffectiveLinks(['WF_SCOPE_DEFINITION'], [row({ kind: 'workflow', workflow_family: 'WF_SCOPE_DEFINITION' })], families)
  assert('lien de l’entreprise et suggestion de même famille : un seul, celui de l’entreprise', dup.links.length === 1 && dup.links[0].origin === 'tenant')

  const mixed = buildEffectiveLinks(['WF_PROCESS_MAPPING', 'WF_CONTEXT_ANALYSIS'], [row({ id: 'x2', kind: 'exclusion', workflow_family: 'WF_PROCESS_MAPPING' }), row({ id: 'm1', kind: 'module', module: 'documents' })], families)
  assert('exclusion + module + suggestion restante', mixed.links.map((l) => l.target).sort().join(',') === 'WF_CONTEXT_ANALYSIS,documents')
}

console.log('\n— Couverture et avertissement (jamais bloquant) —')
{
  const cov = (suggestions: string[], rows: TenantLinkRow[] = []) => coversRequirement(buildEffectiveLinks(suggestions, rows, families).links)
  assert('workflow publié → couvre', cov(['WF_CONTEXT_ANALYSIS']))
  assert('module → couvre', cov([], [row({ kind: 'module', module: 'reviews' })]))
  assert('brouillon → ne couvre pas', !cov(['WF_STAKEHOLDER_ANALYSIS']))
  assert('déprécié → ne couvre pas', !cov(['WF_OLD']))
  assert('workflow non défini → ne couvre pas', !cov(['WF_PROCESS_MAPPING']))
  assert('aucun lien → ne couvre pas', !cov([]))

  const noLinks = buildEffectiveLinks(['WF_PROCESS_MAPPING'], [], families).links
  assert('exigence sans couverture : un avertissement', linkWarnings({ requirement_type: 'requirement' }, 'applicable', noLinks).join() === NO_COVERAGE_WARNING)
  assert('exigence applicable par défaut (pas d’évaluation) : avertie aussi', linkWarnings({ requirement_type: 'requirement' }, null, noLinks).length === 1)
  assert('exigence non applicable : aucun avertissement', linkWarnings({ requirement_type: 'requirement' }, 'not_applicable', noLinks).length === 0)
  assert('note / annexe (hors exigence) : aucun avertissement', linkWarnings({ requirement_type: 'note' }, 'applicable', noLinks).length === 0)
  assert('exigence couverte : aucun avertissement', linkWarnings({ requirement_type: 'requirement' }, 'applicable', buildEffectiveLinks(['WF_CONTEXT_ANALYSIS'], [], families).links).length === 0)
}

console.log('\n— La carte n’influence JAMAIS le statut de couverture —')
{
  const req = {
    id: 'ISO9001-2026-7.2', clause: '7', title: 'Compétence', requirement_type: 'requirement', source_ref: '7.2',
    process_owner: 'RH', software_control: 'x', objective_evidence: 'Matrice', verification_method: 'MT', spaces: ['C'],
  }
  const noTests: any = { positive: null, negative: null }
  const before = computeState(req, null, noTests, new Set())
  // computeState ne reçoit aucune information sur les liens : même entrée, même résultat
  assert('exigence renseignée, tests non exécutés : prête à tester, bloquante (inchangé)', before.status === 'ready_to_test' && before.blocking === true)
  assert('l’avertissement de lien n’apparaît pas dans les raisons de blocage', !before.reasons.some((r) => r.includes('workflow')))
  const passedTests: any = { positive: { status: 'passed' }, negative: { status: 'passed' } }
  const tested = computeState(req, null, passedTests, new Set())
  assert('exigence testée sans aucun lien : « testée », non bloquante, malgré l’avertissement', tested.status === 'tested' && tested.blocking === false
    && linkWarnings(req, null, []).length === 1)
}

console.log(`\n${passed} ✓ / ${failed} ✗`)
if (failed > 0) process.exit(1)
