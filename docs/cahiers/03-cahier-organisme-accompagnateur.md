# Cahier d'utilisation n° 3 — L'organisme qui accompagne l'implémentation

**Pour qui :** le cabinet, le consultant ou l'organisme qui accompagne une entreprise dans la mise en place d'ISO 9001 (de l'ouverture du projet à l'audit de certification) — **et** la personne qui exploite la plateforme QualiDji pour lui.
**Version décrite :** code de la branche `feat/onboarding-auditor-capa-gaps` (migration 0021). **Rédigé le 2 novembre 2026** à partir du code et d'un parcours réel de l'application avec un compte « Consultant » dans une entreprise vierge.
**Les trois cahiers :** [Entreprise](01-cahier-entreprise.md) · [Auditeur externe](02-cahier-auditeur-externe.md) · [Organisme accompagnateur](03-cahier-organisme-accompagnateur.md).

Ce cahier a deux parties : **A — ce que le consultant fait dans l'application** ; **B — ce que l'organisme et l'opérateur de la plateforme font pour ouvrir et suivre un client**.

---

## 0. Le principe de l'accompagnement dans QualiDji

* Le consultant **construit** (processus, documents, matrice, premières actions) ; l'entreprise **valide**. **Il ne valide jamais** : approbations de workflows, de documents, de non-applicabilités et d'actions sont réservées à l'administrateur et au responsable qualité (RQ) de **l'entreprise**. C'est la séparation des tâches, appliquée par le serveur.
* **Un compte = une entreprise.** Un cabinet qui accompagne plusieurs clients utilise **un compte par client**, avec une **adresse e-mail différente par client** (ex. `conseil+atelier@cabinet.example`, `conseil+menuiserie@cabinet.example`) : une même adresse ne peut pas appartenir à deux entreprises. Il n'existe pas de tableau de bord multi-clients.
* Tout ce que fait le consultant est **tracé** (journal d'audit) comme pour n'importe qui : l'entreprise et l'auditeur voient son nom sur chaque brouillon qu'il a rédigé.
* L'IA **n'écrit pas les processus** à votre place : « le responsable qualité définit les workflows ; l'IA ne les génère pas ». Elle ne fait que suggérer des aides d'exécution sur une étape existante.

---

# PARTIE A — Le consultant dans l'application

## A.1 Votre accès

1. L'administrateur de l'entreprise vous invite (rôle **Consultant**) depuis **Utilisateurs → Inviter**, **ou** l'opérateur vous ajoute à l'ouverture de l'entreprise (Partie B).
2. Vous recevez « Invitation à rejoindre QualiDji » : le lien (usage unique, expirant) ouvre **Choisissez votre mot de passe** ([capture](img/03-definir-mot-de-passe.png)) : **Nouveau mot de passe** (12 caractères minimum), **Confirmer le mot de passe**, **Enregistrer et accéder à mon espace**.
3. Vous arrivez sur le **Tableau de bord** ([capture](img/50-consultant-tableau-de-bord.png)). L'en-tête indique « *Consultant · Consultant* » (**Espace 1 — Consultant / accompagnement**).
4. Connexion ultérieure : [page de connexion](img/01-connexion.png) ; **Mot de passe oublié ?** pour un nouveau lien.

**Votre menu :** **Tableau de bord · Mes actions · Non-conformités · Prêt audit · Matrice ISO · Bibliothèque WF · Rapports · Documents.**
*(Fermés pour vous : Utilisateurs, Audits internes, Revues direction.)*

## A.2 Ce que vous pouvez et ne pouvez pas faire

| Vous **pouvez** | Vous **ne pouvez pas** |
|---|---|
| Créer, dupliquer, éditer et **soumettre** des workflows | **Approuver** un workflow (administrateur ou RQ) |
| Créer, éditer, **soumettre** des documents ; en faire de nouvelles versions | **Approuver** ou déprécier un document |
| Renseigner la **Matrice ISO** : applicabilité, responsable, preuve, méthode, tests, liens | **Approuver** une non-applicabilité |
| **Lancer** et **réassigner** des actions, voir **toutes** les actions et leurs preuves | Exécuter ou soumettre une action ; valider ou rejeter |
| Lire les NC et CAPA | Créer une NC, lancer une CAPA, vérifier son efficacité |
| Consulter **Prêt audit** (journal) et **Rapports**, exporter les CSV et le paquet d'audit | Inviter ou suspendre des utilisateurs, changer des rôles |
| Voir **vos propres brouillons** dans la bibliothèque et les documents | Voir les brouillons des autres, ni les documents « Secret » |

Le détail des droits est en [annexe A du cahier n° 1](01-cahier-entreprise.md#annexe-a--qui-peut-quoi-droits-réels-de-la-base).

## A.3 La méthode, phase par phase

Chaque phase : **but → écran → pas à pas → qui valide → critère de sortie mesurable dans l'application**.

### Phase 0 — Cadrage : l'équipe et le périmètre
* **But :** une équipe minimale en place ; le périmètre (activités, sites) décidé.
* **Avec le client :** l'administrateur invite le **RQ**, au moins un **exécutant** (responsable de processus ou opérateur), un **auditeur interne distinct du RQ** (**Utilisateurs**).
* **Vous :** vérifiez, sur le bandeau **Que faire ici ?** du **Tableau de bord**, que « Responsable qualité présent », « exécutant actif » et « Auditeur interne présent » sont verts.
* **Critère de sortie :** équipe invitée, mots de passe choisis, première connexion de chacun.

### Phase 1 — Diagnostic : la Matrice ISO
* **Écran :** **Matrice ISO** ([capture](img/18-matrice.png)).
* **Pas à pas :**
  1. Parcourez les 54 exigences avec le RQ ; pour chacune ouvrez la ligne ([capture](img/64-matrice-fiche.png)).
  2. Statuez l'**applicabilité** : **Applicable**, **En cours de revue (non analysé)**, **Non applicable (justification obligatoire)** ([capture](img/66-matrice-non-applicable.png)) ; rédigez une justification **motivée** (pas « sans objet »).
  3. Pour chaque exigence applicable : **Responsable**, **Contrôle logiciel** (quel workflow ou module la couvre), **Preuve attendue**, **Méthode de vérification**.
  4. **Workflows et modules liés** : reliez l'exigence aux workflows de **l'entreprise** et aux modules (Audits internes, Revues de direction, NC/CAPA, Documents) ; chaque lien exige un **motif**. Ces liens sont informatifs (avertissement, jamais blocage).
  5. **Tests d'acceptation** ([capture](img/65-matrice-tests.png)) : **Positif** et **Négatif** passent à **Conforme ✓** *après* que vous avez réellement vérifié.
  6. **Motif de la modification** (obligatoire), **Enregistrer la ligne**.
* **Qui valide :** les non-applicabilités sont **approuvées par l'administrateur ou le RQ** (personne distincte de vous) : **prévenez-les**, rien ne les notifie.
* **Critère de sortie :** aucune ligne « Non analysé » ; non-applicabilités toutes approuvées ; **lacunes bloquantes** en baisse régulière (carte **Lacunes bloquantes**).
* **Attention :** le catalogue est à confirmer sur un exemplaire autorisé de la norme ; l'outil ne tient pas lieu de norme.

### Phase 2 — Conception : les processus (workflows)
* **Écran :** **Bibliothèque WF** ([capture](img/15-bibliotheque-workflows.png)).
* **Point de départ :** la plateforme ne fournit qu'**un** workflow : **WF_CONTEXT_ANALYSIS** (clause 4.1). **Tout le reste est à rédiger** par vous et le client (voir le programme en §A.5).
* **Pas à pas :**
  1. **Dupliquer** le workflow global (motif) ([capture](img/60-dupliquer-motif.png)) **ou Nouveau workflow**.
  2. **Éditer le brouillon** ([capture](img/61-editeur-workflow.png)) — guide de conception en §A.4.
  3. **Soumettre en revue** (icône avion).
  4. **Prévenez l'administrateur du client** : il est notifié (« Approbation requise »), mais une relance évite l'attente. Il relit puis **Approuver (publication)** ou **Rejeter (motif)** ; en cas de rejet, le motif s'affiche : « *Dernier rejet : …* ».
* **Critère de sortie :** les workflows prévus sont **Publiés** (filtre **Publié**).
* **Règle :** vous ne pouvez pas modifier un workflow publié : **Dupliquer** (motif) crée la version suivante. **L'ancienne version reste Publiée tant que l'administrateur ou le RQ ne l'a pas dépréciée** (icône **Déprécier**, motif) : demandez-le après la publication de la nouvelle, sinon les deux restent proposées dans **Nouvelle action**.

### Phase 3 — Documentation maîtrisée
* **Écran :** **Documents**.
* **Pas à pas :**
  1. **Nouveau document** ([capture](img/62-document-nouveau.png)) : **Titre**, **Type**, **Classification**, **Extrait indexable** (résumé opérationnel : objet, étapes clés, seuils — **sans donnée personnelle** ; il alimente l'assistant IA).
  2. **Créer le brouillon**, puis cochez **Afficher mes brouillons** pour le retrouver ([capture](img/63-consultant-mes-brouillons.png)).
  3. **Éditer** si besoin, **Soumettre en revue**.
  4. **Le RQ ou l'administrateur** (≠ vous) **approuve (publication)** ou rejette avec motif.
* **Limite :** QualiDji ne stocke **pas** les fichiers des documents ; le registre porte le résumé. Gardez le fichier maître dans la GED du client et mettez sa référence dans l'extrait.
* **Critère de sortie :** documents requis publiés (politique, procédures documentées, instructions, formulaires), anciennes versions dépréciées.

### Phase 4 — Déploiement : premières actions
* **Écran :** **Tableau de bord → Nouvelle action** ([capture](img/67-nouvelle-action.png)).
* **Pas à pas :** **Workflow \*** (publié), **Action \***, **Assigner à \*** (exécutant actif du client), **Échéance**, **Lancer l'action**. Suivez : **Mes actions** (filtres Assignées, En cours, Soumises, Bloquées, Approuvées).
* **Accompagner l'exécution :** vous voyez toutes les actions et **leurs preuves** (**Voir les preuves**, **Vérifier** l'intégrité). Vous pouvez **Réassigner** une action Assignée/En cours/Bloquée (panneau **Contexte de l'action**). Le guide « **Que faire ici ?** » de l'exécutant lui indique la prochaine étape.
* **La validation revient au RQ du client** (pas à vous, ni à l'exécutant).
* **Critère de sortie :** plusieurs actions **Approuvées** sur des workflows différents, avec preuves.

### Phase 5 — Mesure, écarts et amélioration
* **Écrans :** **Non-conformités**, **Rapports**.
* **Vous lisez** les NC et leurs CAPA ; **le RQ** crée les plans CAPA et **vérifie l'efficacité** ([captures](img/72-nc-capa-formulaire.png), [73](img/73-capa-verification.png), [74](img/74-nc-cloturee.png)). Conseillez : cause racine réelle, action corrective datée, **vérification d'efficacité par une autre personne que l'auteur du plan** (non imposé par le logiciel).
* **Pilotage :** **Rapports** ([capture](img/24-rapports.png)) — actions par statut, retards, registre NC/CAPA, **CAPA en retard**, **Efficacité non conforme** ; exports **CSV actions**, **CSV NC/CAPA**, **CSV journal d'audit**, **Paquet d'audit**.
* **Critère de sortie :** aucune NC ouverte sans CAPA, aucune CAPA en retard, aucune action en retard.

### Phase 6 — Audit interne et revue de direction (par le client)
* **Écrans :** **Audits internes**, **Revues direction** — **fermés au consultant** : ils sont tenus par le RQ, l'administrateur et l'auditeur interne du client.
* **Votre rôle :** conseiller sans saisir. Vérifiez le travail via **Prêt audit** (le journal montre `audit.*` et `management_review.*`) et via **Rapports**. Rappelez : l'**auditeur interne ne doit pas être le RQ** (« Auditeur (≠ vous) ») ; la **revue** exige des entrées consolidées **et** une décision pour être « tenue » ; les entrées 9.3 hors plateforme (satisfaction client, objectifs, fournisseurs, risques) sont à consigner en décisions ou document.
* **Critère de sortie :** un audit interne **clôturé** (constats vérifiés efficaces, synthèse), une revue de direction **tenue**.

### Phase 7 — Pré-certification et audit
* **Écran :** **Prêt audit** ([capture](img/26-pret-audit.png)) et **Rapports**.
* **Check-list de bascule :** ☐ **zéro lacune bloquante** (Matrice ISO) ☐ NC ouvertes toutes avec CAPA ☐ aucune action en retard ☐ audit interne clôturé ☐ revue de direction tenue ☐ documents en vigueur publiés ☐ compte **Auditeur externe** créé par l'administrateur du client ([cahier n° 2](02-cahier-auditeur-externe.md)) ☐ CSV d'archive exportés (actions, NC/CAPA, **journal complet**, matrice).
* **Audit à blanc :** demandez à l'administrateur de vous créer un **second compte en rôle Auditeur externe** (autre adresse) ; parcourez le dossier avec le [cahier n° 2](02-cahier-auditeur-externe.md) : vous verrez ce que verra le certificateur.
* **Après l'audit :** les constats du certificateur se traitent en **NC** (le RQ les crée, lance les CAPA) ; l'administrateur **suspend** le compte externe.

### Phase 8 — Fin de mission
L'administrateur du client **suspend votre compte** (**Utilisateurs → icône ⊘**) : vos sessions sont coupées ; **votre historique reste** (brouillons rédigés, motifs, événements). Remettez au client : la liste des workflows/documents créés, les CSV d'archive, ce cahier.

## A.4 Guide de conception d'un workflow (ce que le client n'aura pas à corriger)

### Les éléments
* **Workflow** = un processus (ex. « Contrôle à réception des matières », clause 8.4) : **Nom**, **Clause ISO**, **Fréquence** (À évènement / Annuelle / Continue), **Propriétaire (rôle)**.
* **Action** = une tâche confiée à un rôle : **Titre**, **Objectif**, **Rôle exécutant**.
* **Étape** = une saisie ou un contrôle : **Titre**, **type**, **Requise**, **Règle**, **Instruction opérateur**.

### Choisir le type d'étape

| Je veux… | Type | Règle utile |
|---|---|---|
| Faire lire une consigne | **Instruction** | — |
| Recueillir un texte | **Texte** / **Question de connaissance** | `min_length:50` |
| Recueillir une mesure | **Nombre** / **Capteur** | `min:0`, `max:8` |
| Faire choisir une option | **Choix** (+ **Justification obligatoire si le choix est…**) | — |
| Faire cocher | **Case à cocher** / **Confirmation** (« Je confirme ») | — |
| Dater un événement | **Date** | — |
| Capter une identité / un code / un lieu | **Signature** (nom), **Code-barres**, **QR code**, **Position** | — |
| Exiger une pièce | **Photo** / **Fichier** (description) **+ dépôt dans « Preuves »** | — |
| Faire trancher par un responsable | **Approbation** (**Rôle approbateur**, **Approbateur distinct de l'exécutant**) | — |

**Règles de validation acceptées** (les autres sont refusées à l'enregistrement) : `min_length:N`, `max_length:N`, `min:N`, `max:N`.
**Garde-fou** : sur une étape **Choix**, « Justification obligatoire si le choix est *X* » avec une **longueur minimale** ; sans justification suffisante, le serveur refuse.
**Étape d'approbation :** elle **ne se saisit pas** ; l'approbateur la tranche au moment de **Approuver** l'action. Si vous fixez un **Rôle approbateur**, seul ce rôle (ou l'administrateur) peut approuver ; sinon tout titulaire du droit de valider (RQ, responsables de site/département, administrateur). L'exécutant ne peut jamais approuver sa propre action.

### Exemple complet, testé : « Contrôle à réception des matières » (clause 8.4)

| # | Titre de l'étape | Type | Règle / options | Instruction |
|---|---|---|---|---|
| 1 | Mesurer la température du lot | Nombre | `max:8` | Relever la température à cœur (°C) avec la sonde étalonnée. |
| 2 | Décision sur le lot | Choix | choix `accepte` / `refuse` ; **justification obligatoire si « refuse »**, 100 car. | Accepter ou refuser le lot. |
| 3 | Confirmer l'enregistrement | Confirmation | requise | Confirmer que le lot est enregistré dans le registre de réception. |
| 4 | Validation qualité | Approbation | rôle approbateur : Responsable qualité ; approbateur distinct | Le responsable qualité valide la décision. |

*Ce que voit l'exécutant :* un champ numérique qui **refuse 12** (max 8) et accepte 6,5 ; un choix qui **exige 100 caractères** pour « refuse » ; une case « Je confirme » ; une quatrième carte « non saisissable ». Après **Soumettre l'action complète**, le RQ approuve.
*Ce qu'en voit l'auditeur :* chaque saisie, la validation, et le journal.

### Bonnes pratiques
* **Une action = un rôle exécutant.** Si deux rôles interviennent, faites deux actions.
* **Rendez les preuves explicites** : une étape *Photo/Fichier* dit quoi joindre ; la pièce se dépose dans **Preuves & guidage IA**.
* **Contraintes réalistes :** `min_length:50` oblige à une vraie phrase ; un seuil `max` doit venir de la procédure, pas de votre intuition.
* **Nommez les codes** de façon lisible (`WF_…` en majuscules) ; la clause ISO est obligatoire.
* **Relisez avec l'exécutant** avant la soumission en revue : un workflow impossible à exécuter bloque toute l'équipe.

## A.5 Le programme de contenu à rédiger

La matrice annonce des workflows que la plateforme **ne fournit pas encore** (état au 25/10/2026, `docs/BACKLOG_CONTENU_METIER.md`). C'est votre **feuille de route de rédaction** avec le client :

| Clause | Codes mappés à définir |
|---|---|
| 4 | `WF_PROCESS_MAPPING`, `WF_SCOPE_DEFINITION`, `WF_STAKEHOLDER_ANALYSIS` |
| 5 | `WF_LEADERSHIP_REVIEW`, `WF_POLICY_MANAGEMENT`, `WF_RACI_DEFINITION` |
| 6 | `WF_OBJECTIVE_PLANNING`, `WF_RISK_OPPORTUNITY`, `WF_CHANGE_PLANNING` |
| 7 | `WF_AWARENESS_PROGRAM`, `WF_COMMUNICATION_PLAN`, `WF_COMPETENCY_MANAGEMENT`, `WF_DOCUMENT_CONTROL`, `WF_RESOURCE_PROVISION`, `WF_MONITORING_ANALYSIS` |
| 8 | `WF_DESIGN_CONTROL`, `WF_NC_HANDLING`, `WF_OPERATIONAL_PLANNING`, `WF_PRODUCTION_CONTROL`, `WF_RELEASE_CONTROL`, `WF_REQUIREMENTS_REVIEW`, `WF_SUPPLIER_CONTROL` |
| 9 | `WF_INTERNAL_AUDIT`, `WF_MANAGEMENT_REVIEW` |
| 10 | `WF_CONTINUAL_IMPROVEMENT`, `WF_CORRECTIVE_ACTION` |

Remarques : `WF_INTERNAL_AUDIT`, `WF_MANAGEMENT_REVIEW`, `WF_NC_HANDLING`, `WF_CORRECTIVE_ACTION` sont déjà couverts **fonctionnellement** par les écrans Audits internes, Revues direction et Non-conformités : il n'est pas nécessaire de les redéfinir ; **reliez-les** comme **modules** dans la matrice. Les thèmes sans module (risques, objectifs, compétences, fournisseurs, satisfaction client, changements) se traitent par **workflows + documents** ; adaptez les codes de la liste à la réalité du client.

## A.6 Limites à garder en tête

| Sujet | Réalité | Que faire |
|---|---|---|
| Multi-clients | Un compte par client, une adresse par client | Adresses `+client` ou alias |
| Invitation d'utilisateurs | Réservée à l'administrateur du client | Lui transmettre la liste à inviter |
| Notification d'une soumission | Les **administrateurs** sont notifiés des workflows ; **rien ne notifie** pour un document ou une non-applicabilité à approuver | Prévenir le RQ / l'administrateur |
| Bibliothèque de modèles | 1 workflow global | Constituer votre propre trame de départ, à ressaisir dans chaque entreprise |
| Import / export de workflows | Non | Saisie manuelle dans l'éditeur |
| Fichiers de documents | Non stockés | GED externe |
| Audits internes / revues | Écrans fermés au consultant | Suivre par **Prêt audit** et **Rapports** |
| Export PDF | Non (CSV) | Impression du navigateur |

---

# PARTIE B — L'organisme et l'opérateur de la plateforme : ouvrir et suivre un client

## B.1 Avant d'ouvrir le premier client (une seule fois)

1. **Migrations appliquées**, dont la **0021** (lecture seule des auditeurs, cycle de vie CAPA) : `supabase db push --db-url <chaîne> --dry-run` puis sans `--dry-run`.
2. **Supabase → Authentication → URL Configuration** : `Site URL` = adresse du site ; `Redirect URLs` = `https://<site>/**` ; **désactiver** « Allow new users to sign up » (produit sur invitation).
3. **Modèles d'e-mail** : coller `supabase/templates/invite.html` (Invite user) et `recovery.html` (Reset password) ; objets « Invitation à rejoindre QualiDji » / « Réinitialisation de votre mot de passe QualiDji ».
4. **SMTP transactionnel** configuré (le quota intégré est d'environ **un e-mail par heure** : l'invitation peut répondre « *quota d'envoi d'e-mails … réessayer plus tard* »).
5. Variable **`APP_URL`** (adresse publique) côté backend, pour que le lien d'invitation pointe vers `/set-password`.
6. **Fournisseur IA** (facultatif) : sans lui, le guidage fonctionne en mode « gabarit ».

Détail : [DEPLOIEMENT.md §14](../DEPLOIEMENT.md).

## B.2 Ouvrir une entreprise (par client)

```bash
ALLOW_REMOTE_PROVISIONING=1 APP_URL=https://<site> \
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
pnpm --filter @iso/backend tenant:create -- --name "Atelier Djibouti SARL" \
  --admin-email direction@atelier.example --admin-name "A. Direction" \
  --also quality_manager:qualite@atelier.example:"B. Qualité" \
  --also consultant:conseil+atelier@cabinet.example:"Conseil Atelier"
```

* **Sortie attendue :** « ✓ Entreprise « … » créée », puis une ligne « ✓ *rôle* *e-mail* — invitation envoyée » par invité.
* **Refus normaux :** nom d'entreprise déjà utilisé ; e-mail en double dans la commande ; base distante sans `ALLOW_REMOTE_PROVISIONING=1` (protection contre une exécution accidentelle).
* **En cas d'échec partiel :** le tenant existe ; relancez l'invitation manquante depuis **Utilisateurs** (compte administrateur du client).
* Le script **ne manipule aucun mot de passe** et **ne copie aucun contenu** : l'entreprise démarre vierge, avec le seul workflow global.

## B.3 Contrôle de bonne ouverture (5 minutes)

1. Le client reçoit l'e-mail, ouvre le lien, choisit son mot de passe, **atteint son Tableau de bord** ([capture](img/04-premier-acces-tableau-de-bord.png)).
2. **Utilisateurs** liste l'administrateur et les comptes `--also`, **Actif** ([capture](img/11-admin-utilisateurs.png)).
3. **Bibliothèque WF** montre **WF_CONTEXT_ANALYSIS** (badge **global**, **Publié**).
4. Le consultant se connecte et voit **Bibliothèque WF → Dupliquer**.

## B.4 Suivi pendant la mission

| Indicateur | Où | Lecture |
|---|---|---|
| Équipe complète | **Utilisateurs** (client) | RQ, exécutants, auditeur interne présents |
| Avancement de la matrice | **Matrice ISO** | Cartes : applicables, testées conformes, **lacunes bloquantes**, non applicables justifiées |
| Production documentaire | **Documents**, **Bibliothèque WF** | Nombre de **Publié** ; brouillons en attente d'approbation |
| Exécution réelle | **Mes actions**, **Rapports** | Actions approuvées, retards |
| Qualité des écarts | **Non-conformités**, **Rapports** | NC sans CAPA, CAPA en retard, **Efficacité non conforme** |
| Preuve d'activité | **Prêt audit** | Journal, **Journal complet (CSV)** |

Archivez un **CSV du journal et de la matrice à chaque jalon** : c'est votre preuve de mission.

## B.5 Fin de mission et passation

☐ Compte consultant **suspendu** par l'administrateur du client ☐ Liste des workflows/documents remise ☐ CSV d'archive remis ☐ Compte auditeur externe créé puis suspendu après l'audit ☐ Procédure de renouvellement : revue de direction et audit interne **annuels** planifiés dans l'outil.

---

## Annexe — Vocabulaire de l'accompagnateur

**Tenant** : l'entreprise cliente (données cloisonnées). **Espace** : usage de l'outil — 1 Consultant, 2 Personnel interne, 3 Auditeur externe. **Brouillon / En revue / Publié / Déprécié** : cycle de vie d'un workflow ou d'un document. **Séparation des tâches** : le validateur n'est jamais l'auteur. **Lacune bloquante** : exigence applicable sans responsable, preuve, méthode ou couple de tests. **Paquet d'audit** : synthèse chiffrée pour l'auditeur.
</content>
