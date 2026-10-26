/**
 * Tests unitaires — guide contextuel « Que faire ici ? » et question « Comment faire… ? ».
 * Hors ligne (aucune DB, aucun fournisseur IA) : fonctions pures de lib/guide.ts,
 * lib/notice.ts et lib/guideAsk.ts.
 * Exécution : pnpm --filter @iso/backend test:guide
 */
import { buildScreenGuide, GUIDE_SCREENS, GuideFacts, ActionFact } from '../src/lib/guide'
import { searchNotice, NOTICE_SECTIONS } from '../src/lib/notice'
import { buildFallbackAnswer, detectPersonalData, validateAskResponse } from '../src/lib/guideAsk'

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

// Permissions réelles de role_permissions (cloud, 26/10/2026)
const PERMS: Record<string, string[]> = {
  tenant_admin: ['action.approve', 'action.assign', 'action.execute', 'action.read', 'action.submit', 'audit.export', 'capa.close', 'document.approve', 'document.create', 'document.edit_draft', 'document.read', 'evidence.export', 'evidence.read', 'evidence.upload', 'internal_audit.manage', 'management_review.manage', 'tenant.configure', 'tenant.read', 'user.manage', 'workflow.approve', 'workflow.create', 'workflow.edit_draft', 'workflow.read', 'workflow.submit_for_approval'],
  quality_manager: ['action.approve', 'action.assign', 'action.read', 'audit.export', 'capa.close', 'document.approve', 'document.create', 'document.edit_draft', 'document.read', 'evidence.export', 'evidence.read', 'evidence.upload', 'internal_audit.manage', 'internal_audit.respond', 'management_review.manage', 'tenant.read', 'workflow.approve', 'workflow.create', 'workflow.edit_draft', 'workflow.read', 'workflow.submit_for_approval'],
  process_owner: ['action.execute', 'action.read', 'action.submit', 'document.read', 'evidence.read', 'evidence.upload', 'internal_audit.respond', 'tenant.read', 'workflow.read'],
  internal_auditor: ['action.read', 'audit.export', 'document.read', 'evidence.export', 'evidence.read', 'evidence.upload', 'internal_audit.manage', 'tenant.read', 'workflow.read'],
  reader: ['action.read', 'document.read', 'evidence.read', 'tenant.read', 'workflow.read'],
}
const facts = (role: string, over: Partial<GuideFacts> = {}): GuideFacts => ({ role, permissions: new Set(PERMS[role]), ...over })

const action = (over: Partial<ActionFact> = {}): ActionFact => ({
  id: 'a1', title: 'Analyse du contexte', status: 'in_progress', nextStepIndex: 2, nextStepTitle: 'Facteurs externes',
  stepTotal: 4, rejected: false, reviewComment: null, viewerIsExecutor: true, ...over,
})

console.log('\n— Tableau de bord par rôle —')
{
  const g = buildScreenGuide('dashboard', facts('quality_manager', {
    tenantActions: { toApprove: 2, overdue: 0, firstToApproveId: 'x1' },
    workflows: { published: 1, ownPublished: 0, toApprove: 0, myDrafts: 0 },
    team: { active: 3, executors: 1, qualityManagers: 1, internalAuditors: 0, suspended: 0 },
  }))
  assert('QM : « 2 actions soumises à valider » est la prochaine étape', g.next?.label === '2 actions soumises à valider', g.next?.label)
  assert('QM : lien direct vers la première action à valider', g.next?.link === '/workflow/x1')
  assert('QM : pas d’étape d’exécution (pas action.execute)', !g.steps.some((s) => s.id.startsWith('action-') || s.id === 'my-actions-none'))
  assert('QM : pas d’étape d’équipe (pas user.manage)', !g.steps.some((s) => s.id.startsWith('team-')))
}
{
  const g = buildScreenGuide('dashboard', facts('process_owner', { nextAction: action(), myActions: { assigned: 0, inProgress: 1, rejected: 0, blocked: 0, submitted: 0 } }))
  assert('PO : « Étape 2/4 de l’action … à remplir »', g.next?.label === 'Étape 2/4 de l\'action « Analyse du contexte » à remplir', g.next?.label)
  assert('PO : lien vers l’action', g.next?.link === '/workflow/a1')
  assert('PO : aucune étape de validation', !g.steps.some((s) => s.id === 'approve-actions'))
  assert('PO : notice §6.2 sans les sections réservées au QM (§6.1, §6.3)', g.manual.includes('6.2') && !g.manual.includes('6.1') && !g.manual.includes('6.3'))
}
{
  const g = buildScreenGuide('dashboard', facts('process_owner', { nextAction: action({ rejected: true, reviewComment: 'preuve illisible', nextStepIndex: null }) }))
  assert('PO : action rejetée → corriger d’abord, avec le motif', g.next?.id === 'action-rejected' && (g.next?.detail ?? '').includes('preuve illisible'))
  assert('PO : toutes étapes faites → Soumettre proposé', g.steps.some((s) => s.id === 'action-submit'))
}
{
  const g = buildScreenGuide('dashboard', facts('process_owner', { nextAction: null }))
  assert('PO sans action : « Aucune action à exécuter » (done), pas de next', g.next === null && g.steps[0]?.status === 'done')
  const admin = buildScreenGuide('dashboard', facts('tenant_admin', { nextAction: null, workflows: { published: 1, ownPublished: 0, toApprove: 0, myDrafts: 0 } }))
  assert('Admin sans action assignée : pas de ligne « Aucune action à exécuter »', !admin.steps.some((s) => s.id === 'my-actions-none'))
  assert('Workflow global publié : pas d’étape « Publier un premier workflow »', !admin.steps.some((s) => s.id === 'publish-workflow'))
  const wf = buildScreenGuide('workflows', facts('quality_manager', { workflows: { published: 1, ownPublished: 0, toApprove: 0, myDrafts: 0 } }))
  assert('Bibliothèque : adapter le workflow global tant qu’aucun workflow propre n’est publié', wf.next?.id === 'wf-duplicate')
}
{
  const g = buildScreenGuide('dashboard', facts('tenant_admin', {
    team: { active: 1, executors: 0, qualityManagers: 0, internalAuditors: 0, suspended: 0 },
    workflows: { published: 1, ownPublished: 0, toApprove: 0, myDrafts: 0 },
    tenantActions: { toApprove: 0, overdue: 0, firstToApproveId: null },
  }))
  assert('Admin : inviter un QM en premier', g.next?.id === 'team-qm')
  const ex = g.steps.find((s) => s.id === 'team-executor')
  assert('Admin : « aucun exécutant invité » signalé', ex?.status === 'todo' && (ex?.detail ?? '').includes('Aucun exécutant invité'))
  const launch = g.steps.find((s) => s.id === 'launch-action')
  assert('Admin : lancer une action renvoie vers l’invitation d’un exécutant', launch?.status === 'todo' && launch?.link === '/users')
}
{
  const g = buildScreenGuide('dashboard', facts('reader'))
  assert('Lecteur : guide en consultation', g.steps.length === 1 && g.steps[0]?.id === 'read-only')
}

console.log('\n— Écran d’une action —')
{
  const g = buildScreenGuide('action', facts('quality_manager', { action: action({ status: 'submitted', viewerIsExecutor: false, nextStepIndex: null }) }))
  assert('QM sur action soumise : valider ou rejeter', g.next?.id === 'action-review')
  const g2 = buildScreenGuide('action', facts('tenant_admin', { action: action({ status: 'submitted', viewerIsExecutor: true, nextStepIndex: null }) }))
  assert('Séparation des tâches : l’exécutant ne se voit pas proposer la validation', !g2.steps.some((s) => s.id === 'action-review') && g2.steps.some((s) => s.id === 'action-sod'))
  const g3 = buildScreenGuide('action', facts('process_owner', { action: action() }))
  assert('PO sur action en cours : étape suivante, sans lien (déjà sur la page)', g3.next?.id === 'action-next-step' && g3.next?.link === undefined)
  const g4 = buildScreenGuide('action', facts('process_owner', { action: null }))
  assert('Action introuvable ou non visible : aucun détail divulgué', g4.steps.length === 1 && g4.steps[0]?.status === 'info')
}

console.log('\n— Autres écrans —')
{
  const nc = buildScreenGuide('nc', facts('quality_manager', { nc: { open: 3, withoutCapa: 2, capaOverdue: 1 } }))
  assert('NC (QM) : lancer un plan CAPA pour 2 NC', nc.next?.id === 'nc-capa' && nc.next?.count === 2)
  const ncPo = buildScreenGuide('nc', facts('process_owner', { nc: { open: 3, withoutCapa: 2, capaOverdue: 1 } }))
  assert('NC (PO) : rien à traiter, explication de l’exception', ncPo.next === null && ncPo.steps.some((s) => s.id === 'nc-exception'))
  const docs = buildScreenGuide('documents', facts('quality_manager', { documents: { published: 0, toApprove: 1, myDrafts: 0, myInReview: 0 } }))
  assert('Documents (QM) : approuver le document en revue d’abord', docs.next?.id === 'doc-approve')
  const docsPo = buildScreenGuide('documents', facts('process_owner', { documents: { published: 4, toApprove: 1, myDrafts: 0, myInReview: 0 } }))
  assert('Documents (PO) : lecture seule, rien à approuver', docsPo.next === null && docsPo.steps.some((s) => s.id === 'doc-read'))
  const aud = buildScreenGuide('audits', facts('process_owner', { audits: { open: 1, toStart: 0, inProgress: 0, toVerify: 0, closable: 0, toRespond: 1 } }))
  assert('Audits (PO) : répondre à 1 constat', aud.next?.id === 'audit-respond')
  const audIa = buildScreenGuide('audits', facts('internal_auditor', { audits: { open: 1, toStart: 1, inProgress: 0, toVerify: 0, closable: 0, toRespond: 0 } }))
  assert('Audits (auditeur) : démarrer l’audit planifié', audIa.next?.id === 'audit-start')
  const mat = buildScreenGuide('matrice', facts('quality_manager', { matrix: { applicable: 54, blocking: 10, toReview: 2, naPending: 1 } }))
  assert('Matrice (QM) : exigences en revue d’abord, puis 7 à compléter', mat.next?.id === 'matrix-review' && mat.steps.find((s) => s.id === 'matrix-blocking')?.count === 7)
  const rev = buildScreenGuide('reviews', facts('quality_manager', { reviews: { drafts: 0, draftsWithoutInputs: 0, lastHeldAt: null } }))
  assert('Revues : créer la première revue', rev.next?.id === 'review-create')
  for (const screen of GUIDE_SCREENS) {
    for (const role of Object.keys(PERMS)) {
      const g = buildScreenGuide(screen, facts(role))
      if (!g.title || g.manual.length === 0) assert(`écran ${screen} / ${role} : titre et sections de notice`, false)
    }
  }
  assert('chaque écran × rôle produit un guide titré avec renvoi à la notice', true)
}

console.log('\n— Notice et question libre —')
{
  const r = searchNotice('Comment joindre une preuve à une étape ?', 'action')
  assert('recherche : « joindre une preuve » → §6.2', r[0]?.id === '6.2', r.map((s) => s.id).join(','))
  const r2 = searchNotice('comment inviter un collègue', 'users')
  assert('recherche : « inviter » → §3', r2[0]?.id === '3', r2.map((s) => s.id).join(','))
  assert('recherche : sans mot utile → aucune section', searchNotice('???', null).length === 0)
  assert('notice : sections 1 à 11 présentes', ['1', '3', '4.1', '4.3', '5', '6.1', '6.2', '6.3', '7', '8', '9', '10.1', '11'].every((id) => NOTICE_SECTIONS.some((s) => s.id === id)))

  assert('données personnelles : e-mail détecté', detectPersonalData('envoyer à jean.dupont@acme.fr') === 'adresse e-mail')
  assert('données personnelles : téléphone détecté', detectPersonalData('appeler le 06 12 34 56 78') === 'numéro de téléphone')
  assert('données personnelles : une date n’est pas un téléphone', detectPersonalData('contrôle du 2026-10-12 non fait') === null)
  assert('données personnelles : question ordinaire acceptée', detectPersonalData('Comment soumettre mon action ?') === null)

  const ok = validateAskResponse({ answer: 'Faites ceci', steps: ['a'], source_ids: ['notice:6.2', 'inventé'], confidence_label: 'high' }, new Set(['notice:6.2']))
  assert('contrat : source inconnue retirée (R3)', ok.ok && ok.value.source_ids.length === 1 && ok.removedSources[0] === 'inventé')
  assert('contrat : réponse non structurée rejetée', !validateAskResponse({ text: 'libre' }, new Set()).ok)
  assert('contrat : confiance fantaisiste rejetée', !validateAskResponse({ answer: 'x', confidence_label: 'certain' }, new Set()).ok)

  const guide = buildScreenGuide('dashboard', facts('process_owner', { nextAction: action() }))
  const fb = buildFallbackAnswer(searchNotice('joindre une preuve', 'action'), guide)
  assert('repli : réponse tirée de la notice, sources citées', fb.answer.includes('§6.2') && fb.steps.length > 0 && fb.source_ids.includes('notice:6.2'))
  const fb2 = buildFallbackAnswer([], guide)
  assert('repli sans section : renvoie aux étapes du guide, confiance basse', fb2.confidence_label === 'low' && fb2.steps.length > 0)
}

console.log(`\n${passed} ✓ / ${failed} ✗`)
if (failed > 0) process.exit(1)
