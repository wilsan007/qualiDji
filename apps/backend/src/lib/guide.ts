/**
 * Guide contextuel « Que faire ici ? » — déterministe, sans IA, toujours disponible.
 * À partir de l'écran courant, des permissions du rôle (role_permissions) et de faits
 * calculés sur les données réelles du tenant (routes/guide.ts), il dit à chaque
 * utilisateur ce qu'il doit faire maintenant, étape par étape. Fonctions pures, testées
 * par scripts/test_guide.ts. Le contenu suit la notice d'utilisation (lib/notice.ts).
 */

export const GUIDE_SCREENS = [
  'dashboard', 'workflow', 'action', 'nc', 'audit', 'matrice',
  'workflows', 'users', 'reports', 'documents', 'audits', 'reviews',
] as const
export type GuideScreen = (typeof GUIDE_SCREENS)[number]

export interface GuideStep {
  id: string
  label: string
  detail?: string
  /** todo = à faire maintenant ; done = rien en attente ; info = repère permanent. */
  status: 'todo' | 'done' | 'info'
  count?: number
  link?: string
}

export interface ScreenGuide {
  screen: GuideScreen
  role: string
  title: string
  purpose: string
  steps: GuideStep[]
  /** Première étape « todo » : ce qu'il faut faire maintenant (null = rien en attente). */
  next: GuideStep | null
  /** Sections de la notice d'utilisation à relire. */
  manual: string[]
}

/** Action la plus urgente de l'exécutant, ou action ouverte sur l'écran détail. */
export interface ActionFact {
  id: string
  title: string
  status: string
  /** Rang (1-based) de la prochaine étape obligatoire non remplie, null si toutes sont faites. */
  nextStepIndex: number | null
  nextStepTitle: string | null
  stepTotal: number
  rejected: boolean
  reviewComment: string | null
  /** Le lecteur est l'exécutant (assigné ou auteur d'une saisie) : il ne peut pas valider. */
  viewerIsExecutor: boolean
}

export interface GuideFacts {
  role: string
  permissions: Set<string>
  myActions?: { assigned: number; inProgress: number; rejected: number; blocked: number; submitted: number }
  nextAction?: ActionFact | null
  action?: ActionFact | null
  tenantActions?: { toApprove: number; overdue: number; firstToApproveId: string | null }
  team?: { active: number; executors: number; qualityManagers: number; internalAuditors: number; suspended: number }
  /** published : utilisables pour lancer une action (globaux compris) ; ownPublished : propres au tenant. */
  workflows?: { published: number; ownPublished: number; ownInProgress: number; toApprove: number; myDrafts: number }
  documents?: { published: number; toApprove: number; myDrafts: number; myInReview: number }
  nc?: { open: number; withoutCapa: number; capaOverdue: number }
  matrix?: { applicable: number; blocking: number; toReview: number; naPending: number }
  audits?: { open: number; toStart: number; inProgress: number; toVerify: number; closable: number; toRespond: number }
  reviews?: { drafts: number; draftsWithoutInputs: number; lastHeldAt: string | null }
}

const TITLES: Record<GuideScreen, string> = {
  dashboard: 'Tableau de bord',
  workflow: 'Mes actions',
  action: 'Action',
  nc: 'Non-conformités',
  audit: 'Prêt audit',
  matrice: 'Matrice ISO',
  workflows: 'Bibliothèque WF',
  users: 'Utilisateurs',
  reports: 'Rapports',
  documents: 'Documents',
  audits: 'Audits internes',
  reviews: 'Revues direction',
}

const MANUAL: Record<GuideScreen, string[]> = {
  dashboard: ['5', '6.1', '6.2', '6.3'],
  workflow: ['6.2', '6.3', '11'],
  action: ['6.2', '6.3', '11'],
  nc: ['7'],
  audit: ['10.3', '4.3'],
  matrice: ['4.3'],
  workflows: ['4.1'],
  users: ['3', '1'],
  reports: ['10.2', '6.4'],
  documents: ['8'],
  audits: ['9'],
  reviews: ['10.1'],
}

/** Sections de la notice réservées à un rôle qui détient la permission (les autres restent pour tous). */
const SECTION_PERMISSION: Record<string, string> = { '6.1': 'action.assign', '6.2': 'action.execute', '6.3': 'action.approve' }

/** Libellés des rôles, alignés sur le frontend (lib/format.ts). */
export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super administrateur',
  technical_admin: 'Administrateur technique',
  tenant_admin: 'Administrateur tenant',
  quality_manager: 'Responsable qualité',
  site_manager: 'Responsable de site',
  department_manager: 'Responsable de département',
  process_owner: 'Responsable de processus',
  operator: 'Opérateur',
  internal_auditor: 'Auditeur interne',
  external_auditor: 'Auditeur externe',
  consultant: 'Consultant',
  reader: 'Lecteur',
}

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Assignée', in_progress: 'En cours', submitted: 'Soumise', approved: 'Approuvée', blocked: 'Bloquée', closed: 'Clôturée',
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** Étape à faire si n > 0, sinon étape « rien en attente ». */
function counted(id: string, n: number, todo: string, done: string, extra: Partial<GuideStep> = {}): GuideStep {
  return n > 0
    ? { id, status: 'todo', label: todo, count: n, ...extra }
    : { id, status: 'done', label: done, link: extra.link }
}

/** Ce que l'exécutant doit faire sur une action : corriger, remplir l'étape suivante, soumettre. */
function executorSteps(a: ActionFact, onDetail: boolean): GuideStep[] {
  const link = onDetail ? undefined : `/workflow/${a.id}`
  if (a.status === 'blocked') {
    return [{ id: 'action-blocked', status: 'info', link, label: `L'action « ${a.title} » est bloquée`, detail: 'Une exception a été déclarée : le responsable qualité traite la non-conformité. Il peut la réassigner une fois l’écart traité.' }]
  }
  if (a.status === 'submitted') {
    return [{ id: 'action-submitted', status: 'done', link, label: `Action « ${a.title} » soumise`, detail: 'En attente de validation par une autre personne. Rien à faire pour le moment.' }]
  }
  if (['approved', 'closed'].includes(a.status)) {
    return [{ id: 'action-approved', status: 'done', link, label: `Action « ${a.title} » validée`, detail: 'Action terminée.' }]
  }
  const steps: GuideStep[] = []
  if (a.rejected) {
    steps.push({
      id: 'action-rejected', status: 'todo', link,
      label: `Corriger l'action « ${a.title} », rejetée`,
      detail: a.reviewComment ? `Motif du rejet : « ${a.reviewComment} ». Corrigez les étapes concernées puis soumettez à nouveau.` : 'Corrigez les étapes concernées puis soumettez à nouveau.',
    })
  }
  if (a.nextStepIndex !== null) {
    steps.push({
      id: 'action-next-step', status: 'todo', link,
      label: `Étape ${a.nextStepIndex}/${a.stepTotal} de l'action « ${a.title} » à remplir`,
      detail: `${a.nextStepTitle ? `« ${a.nextStepTitle} » : ` : ''}lisez l'instruction, saisissez la réponse, joignez la preuve si elle est demandée, puis enregistrez l'étape.`,
    })
  } else {
    steps.push({
      id: 'action-submit', status: 'todo', link,
      label: `Soumettre l'action « ${a.title} »`,
      detail: 'Toutes les étapes obligatoires sont remplies : cliquez Soumettre ; le responsable qualité sera notifié.',
    })
  }
  steps.push({ id: 'action-exception', status: 'info', label: 'Un problème sur le terrain ?', detail: 'Cliquez Déclarer une exception, décrivez l’écart (quoi, où, quand, impact) et sa gravité : une non-conformité est créée.' })
  return steps
}

function teamSteps(t: NonNullable<GuideFacts['team']>): GuideStep[] {
  return [
    t.qualityManagers > 0
      ? { id: 'team-qm', status: 'done', label: `Responsable qualité présent (${t.qualityManagers})`, link: '/users' }
      : { id: 'team-qm', status: 'todo', label: 'Inviter un responsable qualité', detail: 'Aucun responsable qualité actif : personne ne peut valider les actions ni approuver les documents.', link: '/users' },
    t.executors > 0
      ? { id: 'team-executor', status: 'done', label: `${plural(t.executors, 'exécutant actif', 'exécutants actifs')} (PO, opérateur…)`, link: '/users' }
      : { id: 'team-executor', status: 'todo', label: 'Inviter au moins un exécutant', detail: 'Aucun exécutant invité (responsable de processus, opérateur, responsable de site ou de département) : aucune action ne peut être assignée.', link: '/users' },
    t.internalAuditors > 0
      ? { id: 'team-auditor', status: 'done', label: `Auditeur interne présent (${t.internalAuditors})`, link: '/users' }
      : { id: 'team-auditor', status: 'todo', label: 'Inviter un auditeur interne distinct du QM', detail: 'Recommandé pour les audits internes : on ne s’audite pas soi-même.', link: '/users' },
  ]
}

function approverSteps(t: NonNullable<GuideFacts['tenantActions']>): GuideStep[] {
  return [counted(
    'approve-actions', t.toApprove,
    `${plural(t.toApprove, 'action soumise', 'actions soumises')} à valider`,
    'Aucune action soumise en attente de validation',
    {
      link: t.firstToApproveId ? `/workflow/${t.firstToApproveId}` : '/workflow',
      detail: 'Ouvrez l’action, relisez les réponses et les preuves, puis Approuver ou Rejeter avec un commentaire.',
    },
  )]
}

function launchStep(f: GuideFacts): GuideStep {
  if (f.workflows && f.workflows.published === 0) {
    return { id: 'launch-action', status: 'todo', label: 'Publier un workflow avant de lancer une action', detail: 'Seuls les workflows publiés servent à lancer des actions (Bibliothèque WF).', link: '/workflows' }
  }
  if (f.team && f.team.executors === 0) {
    return { id: 'launch-action', status: 'todo', label: 'Inviter un exécutant avant de lancer une action', detail: 'La liste « Assigner à » est vide tant qu’aucun exécutant n’est invité.', link: f.permissions.has('user.manage') ? '/users' : undefined }
  }
  return { id: 'launch-action', status: 'info', label: 'Lancer une action', detail: 'Tableau de bord → Nouvelle action : workflow publié, action, exécutant, échéance, puis Lancer l’action.', link: '/dashboard' }
}

function myWorkSteps(f: GuideFacts): GuideStep[] {
  const steps: GuideStep[] = []
  if (f.nextAction) steps.push(...executorSteps(f.nextAction, false))
  // Un gestionnaire (assigne aussi) n'a pas besoin d'une ligne « rien à exécuter »
  else if (!f.permissions.has('action.assign')) steps.push({ id: 'my-actions-none', status: 'done', label: 'Aucune action à exécuter', detail: 'Les actions qui vous sont assignées apparaîtront ici et dans la cloche des notifications.' })
  const m = f.myActions
  if (m && m.assigned + m.inProgress > 1) {
    steps.push({ id: 'my-actions-count', status: 'info', label: `${plural(m.assigned + m.inProgress, 'action', 'actions')} en cours ou assignées`, link: '/workflow' })
  }
  return steps
}

function auditSteps(f: GuideFacts): GuideStep[] {
  const a = f.audits
  if (!a) return []
  const steps: GuideStep[] = []
  if (f.permissions.has('internal_audit.respond') && a.toRespond > 0) {
    steps.push({ id: 'audit-respond', status: 'todo', count: a.toRespond, link: '/audits', label: `Répondre à ${plural(a.toRespond, 'constat', 'constats')} d'audit`, detail: 'Audits internes → Répondre sous le constat : réponse factuelle et action corrective proposée.' })
  }
  if (f.permissions.has('internal_audit.manage')) {
    if (a.toStart > 0) steps.push({ id: 'audit-start', status: 'todo', count: a.toStart, link: '/audits', label: `Démarrer ${plural(a.toStart, 'audit planifié', 'audits planifiés')} dont vous êtes l'auditeur`, detail: 'Les constats ne sont possibles qu’une fois l’audit démarré (statut En cours).' })
    if (a.toVerify > 0) steps.push({ id: 'audit-verify', status: 'todo', count: a.toVerify, link: '/audits', label: `Vérifier l'efficacité de ${plural(a.toVerify, 'réponse', 'réponses')}`, detail: 'Contrôlez sur le terrain puis Efficacité vérifiée, ou Inefficace — réouvrir.' })
    if (a.closable > 0) steps.push({ id: 'audit-close', status: 'todo', count: a.closable, link: '/audits', label: `Clôturer ${plural(a.closable, 'audit', 'audits')} dont tous les constats sont vérifiés`, detail: 'Cliquez Clôturer et rédigez la synthèse de clôture (obligatoire).' })
    if (a.inProgress > 0 && a.closable < a.inProgress) steps.push({ id: 'audit-findings', status: 'info', link: '/audits', label: `${plural(a.inProgress, 'audit en cours', 'audits en cours')} : enregistrer les constats`, detail: '+ Constat : titre, faits observés (non modifiables), classification, responsable de processus.' })
  }
  return steps
}

/** Construit le guide d'un écran pour un rôle donné. */
export function buildScreenGuide(screen: GuideScreen, f: GuideFacts): ScreenGuide {
  const has = (p: string) => f.permissions.has(p)
  const steps: GuideStep[] = []
  let purpose = ''

  switch (screen) {
    case 'dashboard': {
      purpose = 'Votre point de départ : tout le travail qui vous attend arrive ici.'
      if (has('user.manage') && f.team) steps.push(...teamSteps(f.team))
      if (has('workflow.approve') && f.workflows && f.workflows.published === 0) {
        steps.push({ id: 'publish-workflow', status: 'todo', link: '/workflows', label: 'Publier un premier workflow', detail: 'Dupliquez le workflow global (clause 4.1), adaptez-le, soumettez-le puis faites-le approuver par une autre personne.' })
      }
      if (has('action.approve') && f.tenantActions) steps.push(...approverSteps(f.tenantActions))
      if (has('action.assign')) {
        steps.push(launchStep(f))
        if (f.tenantActions && f.tenantActions.overdue > 0) {
          steps.push({ id: 'overdue-actions', status: 'todo', count: f.tenantActions.overdue, link: '/reports', label: `${plural(f.tenantActions.overdue, 'action en retard', 'actions en retard')}`, detail: 'Relancez l’exécutant ou réassignez l’action (bloc Réassigner à).' })
        }
      }
      if (has('action.execute')) steps.push(...myWorkSteps(f))
      steps.push(...auditSteps(f))
      if (f.nc && has('capa.close') && f.nc.withoutCapa > 0) {
        steps.push({ id: 'nc-capa', status: 'todo', count: f.nc.withoutCapa, link: '/nc', label: `${plural(f.nc.withoutCapa, 'non-conformité', 'non-conformités')} sans plan CAPA` })
      }
      if (steps.length === 0) {
        steps.push({ id: 'read-only', status: 'info', label: 'Accès en consultation', detail: 'Consultez les actions, les documents publiés, les non-conformités et la Matrice ISO depuis le menu.' })
      }
      break
    }
    case 'workflow': {
      purpose = has('action.assign') ? 'Toutes les actions de l’entreprise, à suivre et à valider.' : 'Les actions qui vous sont assignées.'
      if (has('action.execute')) steps.push(...myWorkSteps(f))
      if (has('action.approve') && f.tenantActions) steps.push(...approverSteps(f.tenantActions))
      if (has('action.assign')) steps.push(launchStep(f))
      if (steps.length === 0) steps.push({ id: 'read-only', status: 'info', label: 'Cliquez une action pour consulter ses étapes et ses preuves' })
      break
    }
    case 'action': {
      purpose = 'Une action se remplit étape par étape, se soumet, puis est validée par une autre personne.'
      const a = f.action
      if (!a) {
        steps.push({ id: 'action-pick', status: 'info', label: 'Choisissez une action dans la liste pour l’ouvrir' })
        break
      }
      if (a.viewerIsExecutor && has('action.execute')) steps.push(...executorSteps(a, true))
      if (has('action.approve') && a.status === 'submitted') {
        steps.push(a.viewerIsExecutor
          ? { id: 'action-sod', status: 'info', label: 'Vous avez exécuté cette action : une autre personne doit la valider', detail: 'Séparation des tâches : on ne valide jamais son propre travail.' }
          : { id: 'action-review', status: 'todo', label: `Valider ou rejeter « ${a.title} »`, detail: 'Relisez chaque réponse et ouvrez les preuves, puis dans Validation de l’action : commentaire puis Approuver, ou Rejeter (commentaire obligatoire).' })
      }
      if (has('action.assign') && ['assigned', 'in_progress', 'blocked'].includes(a.status)) {
        steps.push({ id: 'action-reassign', status: 'info', label: 'Réassigner si besoin', detail: 'Panneau Contexte de l’action → Réassigner à (absence, surcharge, mauvais destinataire).' })
      }
      if (!a.viewerIsExecutor && !has('action.approve') && steps.length === 0) {
        steps.push({ id: 'action-read', status: 'info', label: 'Consultation de l’action', detail: 'Vous pouvez lire les étapes, les réponses et les preuves.' })
      }
      if (steps.length === 0) {
        steps.push({ id: 'action-status', status: 'done', label: `Statut actuel : ${STATUS_LABELS[a.status] ?? a.status}`, detail: 'Aucune intervention attendue de votre part sur cette action.' })
      }
      break
    }
    case 'nc': {
      purpose = 'Le registre des écarts (NC) et de leurs plans d’actions correctives (CAPA).'
      if (has('capa.close') && f.nc) {
        steps.push(counted('nc-capa', f.nc.withoutCapa, `Lancer un plan CAPA pour ${plural(f.nc.withoutCapa, 'NC', 'NC')} qui n'en a pas`, 'Aucune NC ouverte sans plan CAPA', { detail: 'Ouvrez la NC → Lancer un plan CAPA : cause racine, action corrective, responsable, échéance.' }))
        if (f.nc.capaOverdue > 0) steps.push({ id: 'capa-overdue', status: 'todo', count: f.nc.capaOverdue, link: '/reports', label: `${plural(f.nc.capaOverdue, 'CAPA en retard', 'CAPA en retard')}`, detail: 'Relancez le responsable ou revoyez l’échéance.' })
      }
      if (has('action.approve')) steps.push({ id: 'nc-create', status: 'info', label: 'Enregistrer un écart constaté hors action', detail: 'Bouton Nouvelle non-conformité : titre de l’écart, gravité, puis Créer la NC.' })
      if (has('action.execute') && !has('action.assign')) steps.push({ id: 'nc-exception', status: 'info', label: 'Un écart sur une de vos actions ?', detail: 'Déclarez-le depuis l’action (Déclarer une exception) : la NC est créée et liée automatiquement.' })
      if (f.nc) steps.push({ id: 'nc-open', status: 'info', label: f.nc.open > 0 ? `${plural(f.nc.open, 'NC ouverte', 'NC ouvertes')}` : 'Aucune NC ouverte' })
      break
    }
    case 'audit': {
      purpose = 'Préparer la venue d’un auditeur : journal des événements, matrice sans lacune, exports.'
      if (f.matrix) steps.push(counted('matrix-blocking', f.matrix.blocking, `Résoudre ${plural(f.matrix.blocking, 'lacune bloquante', 'lacunes bloquantes')} dans la Matrice ISO`, 'Aucune lacune bloquante dans la Matrice ISO', { link: '/matrice' }))
      if (f.nc) steps.push(counted('audit-nc-open', f.nc.withoutCapa, `${plural(f.nc.withoutCapa, 'NC ouverte sans CAPA', 'NC ouvertes sans CAPA')}`, 'Aucune NC ouverte sans plan CAPA', { link: '/nc' }))
      steps.push({ id: 'audit-export', status: 'info', label: 'Remettre le dossier à l’auditeur', detail: 'Exportez la matrice (CSV), le CSV NC/CAPA et le paquet d’audit (Rapports) ; un compte Auditeur externe en lecture seule peut lui être ouvert.' })
      break
    }
    case 'matrice': {
      purpose = 'Les 54 exigences ISO 9001 : applicabilité, preuves attendues et tests d’acceptation.'
      const m = f.matrix
      if (m && has('workflow.edit_draft')) {
        if (m.toReview > 0) steps.push({ id: 'matrix-review', status: 'todo', count: m.toReview, label: `Statuer sur ${plural(m.toReview, 'exigence', 'exigences')} « En cours de revue »`, detail: 'Ouvrez la fiche : Applicable, ou Non applicable avec une justification motivée, et un motif de modification.' })
        steps.push(counted('matrix-blocking', Math.max(0, m.blocking - m.toReview - m.naPending), `Compléter ${plural(Math.max(0, m.blocking - m.toReview - m.naPending), 'exigence applicable', 'exigences applicables')} (responsable, preuve, méthode, tests)`, 'Aucune lacune bloquante', { detail: 'Renseignez responsable, preuve attendue, méthode de vérification, puis exécutez les tests positif et négatif.' }))
      }
      if (m && has('workflow.approve') && m.naPending > 0) {
        steps.push({ id: 'matrix-na', status: 'todo', count: m.naPending, label: `Approuver ${plural(m.naPending, 'non-applicabilité', 'non-applicabilités')} en attente`, detail: 'Une non-applicabilité doit être approuvée par une autre personne que le demandeur.' })
      }
      if (m) steps.push({ id: 'matrix-progress', status: 'info', label: `${m.applicable} exigences applicables, ${m.blocking} lacune(s) bloquante(s)`, detail: 'Exporter (CSV) produit la matrice pour un auditeur.' })
      break
    }
    case 'workflows': {
      purpose = 'Les processus qualité : ce qu’il faut faire, découpé en actions et en étapes.'
      const w = f.workflows
      if (w && has('workflow.approve')) steps.push(counted('wf-approve', w.toApprove, `Relire et approuver ${plural(w.toApprove, 'workflow', 'workflows')} en revue`, 'Aucun workflow en attente d’approbation', { detail: 'Approuver (publication) ou Rejeter avec un motif ; on n’approuve pas son propre brouillon.' }))
      if (w && has('workflow.create')) {
        if (w.myDrafts > 0) steps.push({ id: 'wf-drafts', status: 'todo', count: w.myDrafts, label: `Finaliser et soumettre ${plural(w.myDrafts, 'brouillon', 'brouillons')}`, detail: 'Éditer : nom, clause, fréquence, actions et étapes ; puis Soumettre en revue.' })
        if (w.ownPublished === 0 && w.ownInProgress === 0) steps.push({ id: 'wf-duplicate', status: 'todo', label: 'Adapter le workflow global à votre entreprise', detail: 'Icône Dupliquer + motif sur le workflow « global » : une copie Brouillon est créée.' })
      }
      if (!has('workflow.create')) steps.push({ id: 'wf-read', status: 'info', label: 'Consultez les workflows publiés', detail: 'Ils décrivent les actions que vous pourrez recevoir et leurs étapes.' })
      break
    }
    case 'users': {
      purpose = 'Constituer l’équipe : il faut au minimum un QM et un exécutant pour faire tourner une action.'
      if (f.team) {
        steps.push(...teamSteps(f.team))
        if (f.team.suspended > 0) steps.push({ id: 'team-suspended', status: 'info', label: `${plural(f.team.suspended, 'compte suspendu', 'comptes suspendus')}`, detail: 'Réactiver rétablit l’accès ; un compte n’est jamais supprimé.' })
      }
      steps.push({ id: 'team-invite', status: 'info', label: 'Inviter un utilisateur', detail: 'E-mail professionnel, rôle, nom affiché, puis Envoyer l’invitation. Un changement de rôle exige un motif.' })
      break
    }
    case 'reports': {
      purpose = 'Piloter : actions par statut et retards, NC/CAPA, paquet d’audit.'
      if (f.tenantActions) steps.push(counted('report-overdue', f.tenantActions.overdue, `${plural(f.tenantActions.overdue, 'action en retard', 'actions en retard')} à relancer`, 'Aucune action en retard'))
      if (f.nc) steps.push(counted('report-capa', f.nc.capaOverdue, `${plural(f.nc.capaOverdue, 'CAPA en retard', 'CAPA en retard')}`, 'Aucune CAPA en retard', { link: '/nc' }))
      steps.push({ id: 'report-export', status: 'info', label: 'Exporter', detail: 'CSV actions et CSV NC/CAPA pour vos réunions ou pour un auditeur.' })
      break
    }
    case 'documents': {
      purpose = 'Les procédures et instructions en vigueur : l’assistant IA s’appuie sur les documents publiés.'
      const d = f.documents
      if (d && has('document.approve')) steps.push(counted('doc-approve', d.toApprove, `Relire et approuver ${plural(d.toApprove, 'document', 'documents')} en revue`, 'Aucun document en attente d’approbation', { detail: 'Approuver (publication) ou Rejeter avec un motif ; l’auteur ne peut pas approuver.' }))
      if (d && has('document.create')) {
        if (d.myDrafts > 0) steps.push({ id: 'doc-drafts', status: 'todo', count: d.myDrafts, label: `Soumettre en revue ${plural(d.myDrafts, 'brouillon', 'brouillons')}`, detail: 'Vérifiez le résumé opérationnel (aucune donnée personnelle) puis Soumettre en revue.' })
        if (d.myInReview > 0) steps.push({ id: 'doc-in-review', status: 'done', label: `${plural(d.myInReview, 'document', 'documents')} en attente de relecture par une autre personne` })
        if (d.published === 0) steps.push({ id: 'doc-first', status: 'todo', label: 'Publier vos premières procédures', detail: 'Nouveau document (brouillon) : titre, type, classification, résumé opérationnel ; puis Créer le brouillon et Soumettre en revue.' })
      }
      if (!has('document.create')) steps.push({ id: 'doc-read', status: 'info', label: 'Consultez la version publiée en vigueur', detail: d ? `${plural(d.published, 'document publié', 'documents publiés')}.` : undefined })
      break
    }
    case 'audits': {
      purpose = 'Un audit interne : planifier, démarrer, constater, répondre, vérifier, clôturer.'
      steps.push(...auditSteps(f))
      if (has('internal_audit.manage') && f.audits && f.audits.open === 0) {
        steps.push({ id: 'audit-plan', status: 'todo', label: 'Planifier un audit interne', detail: 'Planifier un audit : titre, auditeur (une autre personne que vous), périmètre, critères.' })
      } else if (has('internal_audit.manage')) {
        steps.push({ id: 'audit-plan', status: 'info', label: 'Planifier un autre audit', detail: 'L’auditeur désigné doit être une autre personne que l’organisateur.' })
      }
      if (steps.length === 0) steps.push({ id: 'audit-none', status: 'done', label: 'Aucun constat ne vous attend', detail: 'Vous serez notifié si un auditeur vous désigne sur un constat.' })
      break
    }
    case 'reviews': {
      purpose = 'La revue de direction (ISO 9001 §9.3), préparée à partir des données déjà saisies.'
      const r = f.reviews
      if (r) {
        const lastHeldDays = r.lastHeldAt ? Math.floor((Date.now() - new Date(r.lastHeldAt).getTime()) / 86_400_000) : null
        if (r.drafts === 0) {
          steps.push(lastHeldDays === null || lastHeldDays > 365
            ? { id: 'review-create', status: 'todo', label: lastHeldDays === null ? 'Créer votre première revue de direction' : `Dernière revue tenue il y a ${lastHeldDays} jours : créer la suivante`, detail: 'Saisissez le titre (ex. « Revue de direction 2026 ») et créez la revue.' }
            : { id: 'review-create', status: 'done', label: `Dernière revue tenue il y a ${lastHeldDays} jours` })
        }
        if (r.draftsWithoutInputs > 0) steps.push({ id: 'review-inputs', status: 'todo', count: r.draftsWithoutInputs, label: 'Consolider les entrées de la revue', detail: 'La plateforme rassemble actions, NC, CAPA, audits et couverture de la matrice.' })
        if (r.drafts > 0) steps.push({ id: 'review-hold', status: 'todo', count: r.drafts, label: 'Ajouter décisions et actions, puis Marquer tenue', detail: 'Chaque action issue de la revue a un responsable ; une fois tenue, la revue est figée.' })
      }
      break
    }
  }

  return {
    screen,
    role: f.role,
    title: TITLES[screen],
    purpose,
    steps,
    next: steps.find((s) => s.status === 'todo') ?? null,
    manual: MANUAL[screen].filter((id) => !SECTION_PERMISSION[id] || has(SECTION_PERMISSION[id]!)),
  }
}
