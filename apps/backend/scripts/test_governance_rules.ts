/**
 * Tests unitaires — règles de gouvernance posées par la migration 0019 et les
 * routes associées (constats H3 et H7 de docs/AUDIT_ANALYSE_APPROFONDIE.md) :
 *
 *   - H3 : séparation des tâches sur les workflows (l'approbateur n'est ni
 *     l'auteur, ni le soumetteur, ni un contributeur) — logique pure de
 *     routes/workflows.ts, la non-applicabilité K.4 suit la même règle ;
 *   - H7 : verdict de quota IA (limite par utilisateur/heure prime sur la
 *     limite par tenant/jour) — logique pure de routes/ai.ts, comptée en base.
 *
 * Les règles portées par la BASE (journal en ajout seul, version unique
 * publiée, scellé des revues, approbation K.4 par personne distincte) ne sont
 * pas testables hors base : elles sont vérifiées par l'E2E (e2e_rbac.sh,
 * section « durcissement ») contre une pile Supabase réelle.
 *
 * Exécution : pnpm --filter @iso/backend test:governance
 */
import { violatesSegregation } from '../src/routes/workflows'
import { quotaVerdict } from '../src/routes/ai'

let passed = 0
let failed = 0
function assert(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

console.log('— H3 : séparation des tâches (workflows) —')
const wf = { created_by: 'auteur', submitted_by: 'soumetteur', contributor_ids: ['contributeur'] }
assert('l\'auteur ne peut pas approuver', violatesSegregation(wf, 'auteur'))
assert('le soumetteur ne peut pas approuver', violatesSegregation(wf, 'soumetteur'))
assert('un contributeur ne peut pas approuver', violatesSegregation(wf, 'contributeur'))
assert('une personne distincte peut approuver', !violatesSegregation(wf, 'autre-personne'))
assert('champs absents (null/undefined) : pas de faux positif', !violatesSegregation({ created_by: null, submitted_by: undefined, contributor_ids: null }, 'x'))
assert('contributeur_ids vide : un tiers ne viole pas la règle', !violatesSegregation({ created_by: 'a', contributor_ids: [] }, 'b'))

console.log('— H7 : verdict de quota IA —')
assert('sous les deux limites → null (appel autorisé)', quotaVerdict(0, 0, 3, 5) === null)
assert('approche des limites sans les atteindre → null', quotaVerdict(2, 4, 3, 5) === null)
assert("limite utilisateur atteinte → 'user'", quotaVerdict(3, 0, 3, 5) === 'user')
assert("limite utilisateur dépassée → 'user'", quotaVerdict(7, 0, 3, 5) === 'user')
assert("limite tenant atteinte (utilisateur sous sa limite) → 'tenant'", quotaVerdict(2, 5, 3, 5) === 'tenant')
assert("les deux limites atteintes → 'user' (la plus contraignante : fenêtre d'1 h)", quotaVerdict(3, 5, 3, 5) === 'user')
assert('limites nulles : tout appel est refusé (0 = désactivation)', quotaVerdict(0, 0, 0, 5) === 'user' && quotaVerdict(0, 0, 1, 0) === 'tenant')

console.log(`\nRésultat gouvernance : ${passed} réussis, ${failed} échec(s).`)
if (failed > 0) process.exit(1)
