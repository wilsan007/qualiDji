/**
 * Notice d'utilisation de QualiDji (sections 1 à 11), condensée pour le guidage.
 * Source : document « QualiDji — Notice d'utilisation » (25/10/2026).
 * Sert deux usages : renvoi vers la bonne section dans le guide « Que faire ici ? »,
 * et corpus de la question libre « Comment faire… ? » (réponse IA ou extraits).
 * Toute évolution de la notice doit être reportée ici.
 */

export interface NoticeSection {
  id: string
  title: string
  /** Écrans du menu concernés (identifiants GuideScreen). */
  screens: string[]
  /** Mots-clés de recherche (en plus du titre et du texte). */
  keywords: string[]
  text: string
}

export const NOTICE_SECTIONS: NoticeSection[] = [
  {
    id: '1',
    title: 'Les rôles : qui fait quoi',
    screens: ['dashboard', 'users'],
    keywords: ['rôle', 'role', 'menu', 'permission', 'droit', 'qui'],
    text:
      "L'administrateur tenant invite et suspend les utilisateurs, attribue les rôles et approuve documents et workflows. " +
      'Le responsable qualité (QM) lance et assigne les actions, valide ou rejette le travail, traite NC et CAPA, approuve les documents, pilote audits et revues de direction. ' +
      "Le responsable de processus (PO) et l'opérateur réalisent les actions assignées, joignent les preuves, déclarent les écarts et répondent aux constats d'audit. " +
      "L'auditeur interne planifie et conduit les audits internes. Les responsables de site ou de département assignent, exécutent et valident dans leur périmètre. " +
      "Le consultant rédige workflows et documents et assigne des actions, sans valider. L'auditeur externe et le lecteur consultent seulement. " +
      'Socle commun à tous : Tableau de bord, Mes actions, Non-conformités, Matrice ISO.',
  },
  {
    id: '3',
    title: 'Créer les comptes et attribuer les rôles',
    screens: ['users'],
    keywords: ['inviter', 'invitation', 'compte', 'utilisateur', 'suspendre', 'réactiver', 'équipe', 'mot de passe'],
    text:
      'Menu Utilisateurs → bloc Inviter un utilisateur : saisir l\'e-mail professionnel, choisir le rôle, indiquer le nom affiché, puis Envoyer l\'invitation. ' +
      "Il faut au minimum un QM et un PO pour faire tourner une action, car personne ne valide son propre travail. Équipe de départ conseillée : 1 responsable qualité, 1 responsable de processus par processus clé, 1 auditeur interne distinct du QM. " +
      'Changer de rôle ou de nom : modifier la ligne et donner un motif (historique conservé). Suspendre coupe immédiatement les sessions ; Réactiver la rétablit. ' +
      "Un compte n'est jamais supprimé : ses traces d'audit restent rattachées à une personne.",
  },
  {
    id: '4.1',
    title: 'Workflows — Bibliothèque WF',
    screens: ['workflows'],
    keywords: ['workflow', 'dupliquer', 'brouillon', 'publier', 'approuver', 'déprécier', 'étape', 'clause'],
    text:
      'Un workflow décrit un processus qualité : des actions découpées en étapes (texte, valeur numérique, choix, preuve, validation). ' +
      'Les workflows « global » sont fournis par la plateforme, en lecture seule. Pour en adapter un : Dupliquer + motif, une copie Brouillon est créée. ' +
      'Éditer le brouillon (nom, clause ISO, fréquence, rôle propriétaire, actions et étapes avec règle de contrôle comme min_length:50), puis Soumettre en revue. ' +
      "Une autre personne habilitée (QM ou Admin) relit puis Approuver (publication) ou Rejeter avec un motif. Seuls les workflows Publiés servent à lancer des actions. Pour faire évoluer un workflow publié : Dupliquer ; pour le retirer : Déprécier.",
  },
  {
    id: '4.3',
    title: 'Matrice ISO',
    screens: ['matrice', 'audit'],
    keywords: ['matrice', 'exigence', 'applicabilité', 'non applicable', 'justification', 'test', 'lacune', 'export', 'csv'],
    text:
      'La matrice liste les 54 exigences ISO 9001 (clauses 4 à 10). Pour chaque ligne, ouvrir la fiche et renseigner : applicabilité (Applicable, En cours de revue, Non applicable avec justification motivée, approuvée par une autre personne), ' +
      'responsable, contrôle logiciel, preuve attendue, méthode de vérification, tests d\'acceptation positif et négatif (Non exécuté, Conforme, Non conforme), et un motif de modification obligatoire. ' +
      'Les compteurs en haut montrent l\'avancement (applicables, testées conformes, lacunes bloquantes, non applicables justifiées). Exporter (CSV) produit la matrice pour un auditeur.',
  },
  {
    id: '5',
    title: 'Premiers pas de chaque utilisateur',
    screens: ['dashboard'],
    keywords: ['connexion', 'connecter', 'tableau de bord', 'notification', 'cloche', 'hors ligne', 'première'],
    text:
      'Se connecter avec l\'e-mail professionnel et le mot de passe. Vérifier en haut à droite son nom et son rôle ; un rôle inattendu se signale à l\'Admin. ' +
      'À gauche le menu limité au rôle, en haut la cloche des notifications, en bas Déconnexion. Le Tableau de bord affiche quatre compteurs puis la liste Mes actions. ' +
      'Première tâche : Admin → inviter l\'équipe ; QM → publier documents et workflows, compléter la matrice, lancer les premières actions ; PO/Opérateur → ouvrir la première action reçue ; Auditeur interne → consulter Prêt audit et la Matrice ISO. ' +
      'Sans réseau, les saisies d\'étapes sont gardées sur l\'appareil et envoyées au retour du réseau : ne pas fermer la session avant la synchronisation.',
  },
  {
    id: '6.1',
    title: 'QM — lancer et assigner une action',
    screens: ['dashboard', 'workflow', 'action'],
    keywords: ['nouvelle action', 'lancer', 'assigner', 'réassigner', 'exécutant', 'échéance'],
    text:
      'Tableau de bord → Nouvelle action. Choisir un workflow Publié, puis l\'action (le rôle prévu s\'affiche), puis Assigner à : seules les personnes actives pouvant exécuter sont proposées. Si la liste est vide, inviter d\'abord un exécutant. ' +
      'Échéance facultative, puis Lancer l\'action : statut Assignée, l\'exécutant est notifié. ' +
      'Réassigner : ouvrir l\'action, panneau Contexte de l\'action, bloc Réassigner à, choisir un autre exécutant puis Réassigner. Possible tant que l\'action est Assignée, En cours ou Bloquée.',
  },
  {
    id: '6.2',
    title: 'PO — exécuter l\'action',
    screens: ['dashboard', 'workflow', 'action'],
    keywords: ['exécuter', 'étape', 'remplir', 'preuve', 'joindre', 'fichier', 'soumettre', 'exception', 'guidage', 'enregistrer'],
    text:
      'Tableau de bord → cliquer sur l\'action. Pour chaque étape : lire l\'instruction ; au besoin cliquer Générer le guidage (suggestion à vérifier, l\'IA ne valide rien) ; saisir la réponse ; ' +
      'si une preuve est demandée, joindre le fichier (photo, PDF, texte, tableur, 25 Mo maximum, contrôle d\'intégrité intègre/ALTÉRÉ) ; enregistrer l\'étape. ' +
      'Quand toutes les étapes obligatoires sont faites : Soumettre l\'action (statut Soumise, le QM est notifié). ' +
      'Un problème sur le terrain : Déclarer une exception, décrire l\'écart (quoi, où, quand, impact) et choisir la gravité ; l\'action passe en Bloquée et une non-conformité est créée.',
  },
  {
    id: '6.3',
    title: 'QM — valider ou rejeter',
    screens: ['dashboard', 'workflow', 'action'],
    keywords: ['valider', 'approuver', 'rejeter', 'soumise', 'commentaire', 'validation'],
    text:
      'Ouvrir une action Soumise, relire les réponses et ouvrir les preuves. Dans Validation de l\'action : saisir un commentaire puis Approuver, ou Rejeter (commentaire obligatoire). ' +
      'En cas de rejet, le PO voit « Action rejetée — à corriger », corrige et soumet à nouveau. On ne valide jamais une action qu\'on a soi-même exécutée.',
  },
  {
    id: '6.4',
    title: 'Admin — superviser',
    screens: ['dashboard', 'reports', 'audit'],
    keywords: ['superviser', 'retard', 'absence', 'arbitrer'],
    text:
      'Suivre l\'avancement dans Rapports (actions par statut, retards) et Prêt audit (journal des événements). Réaffecter le travail en cas d\'absence (Réassigner à, suspension, rôles). Arbitrer les rejets répétés et les exceptions critiques.',
  },
  {
    id: '7',
    title: 'Non-conformités et CAPA',
    screens: ['nc', 'reports'],
    keywords: ['non-conformité', 'nc', 'capa', 'cause racine', 'action corrective', 'écart', 'gravité'],
    text:
      'Une NC est créée automatiquement quand un PO déclare une exception, ou manuellement par le QM : Nouvelle non-conformité, titre de l\'écart, gravité, Créer la NC. ' +
      'Traiter (QM ou Admin) : ouvrir la NC, Lancer un plan CAPA (cause racine, action corrective, responsable, échéance), Enregistrer le CAPA. ' +
      'Suivre les CAPA en retard dans Rapports. La vérification d\'efficacité n\'a pas encore de bouton : la consigner en revue de direction.',
  },
  {
    id: '8',
    title: 'Documents contrôlés',
    screens: ['documents'],
    keywords: ['document', 'procédure', 'brouillon', 'revue', 'publier', 'approuver', 'nouvelle version', 'déprécier', 'classification'],
    text:
      'Cycle : Brouillon → En revue → Publié → Déprécié ; une seule version publiée à la fois, l\'auteur ne peut pas approuver. ' +
      'Rédiger : Documents → Nouveau document (brouillon), titre, type, classification, résumé opérationnel (objet, étapes clés, seuils ; il alimente l\'assistant IA, aucune donnée personnelle), Créer le brouillon puis Soumettre en revue. ' +
      'Approuver (QM ou Admin, autre que l\'auteur) : relire puis Approuver (publication) ou Rejeter avec un motif. ' +
      'Un document publié n\'est jamais modifié : Nouvelle version (motif obligatoire) ou Déprécier.',
  },
  {
    id: '9',
    title: 'Audit interne pas à pas',
    screens: ['audits'],
    keywords: ['audit interne', 'planifier', 'constat', 'démarrer', 'répondre', 'efficacité', 'clôturer', 'auditeur'],
    text:
      'Six temps : planifier, démarrer, constater, répondre, vérifier, clôturer. Planifier : Audits internes → Planifier un audit, titre, auditeur (une autre personne que vous), périmètre, critères. ' +
      'Auditeur : Démarrer (statut En cours) puis + Constat pour chaque écart (titre, faits observés non modifiables, classification Majeur/Mineur/Observation, responsable de processus notifié). ' +
      'Responsable de processus : Répondre sous son constat (réponse factuelle et action corrective proposée). ' +
      'Auditeur : Efficacité vérifiée, ou Inefficace — réouvrir ; la vérification est faite par une personne distincte de celle qui a répondu. ' +
      'Clôturer quand tous les constats sont vérifiés efficaces, avec une synthèse de clôture obligatoire.',
  },
  {
    id: '10.1',
    title: 'Revue de direction',
    screens: ['reviews'],
    keywords: ['revue de direction', 'revue', 'décision', 'consolider', 'entrées', 'tenue'],
    text:
      'Menu Revues direction : saisir le titre et créer la revue (Brouillon). Consolider les entrées : la plateforme rassemble actions, NC, CAPA, audits et couverture de la matrice. ' +
      'En réunion, ajouter les Décisions puis les Actions issues de la revue avec leur responsable. Marquer tenue à la fin : la revue est figée.',
  },
  {
    id: '10.2',
    title: 'Rapports',
    screens: ['reports'],
    keywords: ['rapport', 'export', 'csv', 'paquet d\'audit', 'retard'],
    text:
      'Bloc Actions : toutes les actions filtrables par statut et dates, avec responsable, échéance, ancienneté et retards (CSV). Bloc NC / CAPA : NC ouvertes, CAPA en retard, efficacité (CSV). ' +
      'Paquet d\'audit : workflows publiés, exigences évaluées, taux d\'évaluation, derniers événements.',
  },
  {
    id: '10.3',
    title: 'Prêt audit',
    screens: ['audit'],
    keywords: ['prêt audit', 'journal', 'auditeur externe', 'préparer'],
    text:
      'Ouvrir Prêt audit : le journal d\'audit liste chaque événement avec auteur et date. Dans la Matrice ISO, viser zéro lacune bloquante puis Exporter (CSV). ' +
      'Remettre à l\'auditeur la matrice, le CSV NC/CAPA et le paquet d\'audit ; un compte Auditeur externe en lecture seule peut lui être ouvert.',
  },
  {
    id: '11',
    title: 'Règles à connaître',
    screens: ['dashboard', 'action', 'documents', 'workflows', 'audits'],
    keywords: ['règle', 'séparation des tâches', 'motif', 'immuable', 'ia', 'données personnelles', 'quota'],
    text:
      'Séparation des tâches : on ne valide jamais son propre travail et on ne s\'audite pas soi-même. Traces non modifiables : journal, interventions IA et preuves. ' +
      'Publié = figé : nouvelle version ou dépréciation. Motif obligatoire pour rejet, nouvelle version, dépréciation, modification de la matrice, changement de rôle. ' +
      'IA = suggestion : l\'humain décide ; ne jamais y saisir de données personnelles ; nombre de demandes limité. Preuves scellées par empreinte. Cloisonnement entre entreprises. ' +
      'Hors ligne : attendre la synchronisation avant de se déconnecter.',
  },
]

/** Normalise pour la recherche : minuscules, sans accents. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const STOP_WORDS = new Set(['comment', 'faire', 'pour', 'avec', 'dans', 'une', 'des', 'les', 'que', 'qui', 'quoi', 'est', 'mon', 'mes', 'son', 'sur', 'par', 'pas', 'faut', 'peux', 'puis', 'doit', 'dois', 'cette', 'quand', 'quel', 'quelle'])

/**
 * Recherche déterministe dans la notice : score = mots-clés trouvés dans la question
 * (poids 3) + mots de la question trouvés dans le titre/texte, bonus si la section
 * concerne l'écran courant. Renvoie les meilleures sections (score > 0).
 */
export function searchNotice(question: string, screen: string | null, limit = 3): NoticeSection[] {
  const q = normalize(question)
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP_WORDS.has(w))
  const scored = NOTICE_SECTIONS.map((s) => {
    const hay = normalize(`${s.title} ${s.text}`)
    let score = 0
    for (const k of s.keywords) if (q.includes(normalize(k))) score += 3
    for (const w of words) if (hay.includes(w)) score += 1
    if (score > 0 && screen && s.screens.includes(screen)) score += 2
    return { s, score }
  })
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s)
}

export function noticeSection(id: string): NoticeSection | undefined {
  return NOTICE_SECTIONS.find((s) => s.id === id)
}
