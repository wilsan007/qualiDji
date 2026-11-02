# Cahier d'utilisation n° 1 — L'entreprise qui met en place ISO 9001

**Pour qui :** l'administrateur du tenant, le responsable qualité (RQ), les responsables de site et de département, les responsables de processus (PO), les opérateurs, l'auditeur interne, le lecteur.
**Version décrite :** code de la branche `feat/onboarding-auditor-capa-gaps` (au-dessus de `main` d15bb79), migration 0021 appliquée. **Rédigé le 2 novembre 2026** à partir du code et d'un parcours réel de l'application, écran par écran, avec six comptes (un par rôle) dans une entreprise vierge.
**Les trois cahiers :** [Entreprise](01-cahier-entreprise.md) · [Auditeur externe](02-cahier-auditeur-externe.md) · [Organisme accompagnateur](03-cahier-organisme-accompagnateur.md).

---

## 0. Comment lire ce cahier

* Les libellés **en gras** sont ceux de l'écran, à l'identique (boutons, champs, onglets).
* « **Résultat attendu** » dit ce que vous devez voir après l'action ; si ce n'est pas le cas, voir §7 (messages d'erreur).
* « **Règle** » signale une contrainte appliquée **par le serveur** : l'interface peut la masquer, jamais la contourner.
* Les captures sont dans [`img/`](img/). Les données qu'elles montrent (« Atelier Visite SARL ») sont fictives.
* Chaque rôle n'a pas tous les écrans : la colonne « Qui » de chaque section dit qui voit l'écran. Un écran interdit ramène au tableau de bord.

---

## 1. Ce que QualiDji apporte — et ce qu'il n'apporte pas

QualiDji est un **assistant d'exécution** du système de management de la qualité : il organise le travail (actions, étapes, preuves), impose les contrôles (séparation des tâches, motifs, traces non modifiables) et prépare le dossier d'audit. Il **ne remplace ni la norme, ni votre analyse, ni l'auditeur**. Principe fondateur : **le responsable qualité définit les processus ; l'IA suggère et n'approuve jamais.**

| Chapitre ISO 9001 | Ce que fait QualiDji | Écran |
|---|---|---|
| 4 Contexte, périmètre | Registre des 54 exigences (clauses 4 à 10) : applicable / non applicable justifié, responsable, preuve attendue, tests | **Matrice ISO** |
| 5 Leadership | Revue de direction, politique via documents | **Revues direction**, **Documents** |
| 6 Planification | *Pas de module dédié* (risques, objectifs) : à traiter par workflows et documents | **Bibliothèque WF**, **Documents** |
| 7.5 Informations documentées | Registre versionné, cycle brouillon → revue → publié, classification | **Documents** |
| 8 Réalisation | Processus décrits en workflows, exécutés en actions avec preuves scellées | **Bibliothèque WF**, **Mes actions** |
| 9.1 Surveillance | Rapports, journal d'audit, paquet d'audit | **Rapports**, **Prêt audit** |
| 9.2 Audit interne | Planification, constats, réponses, vérification, clôture | **Audits internes** |
| 9.3 Revue de direction | Entrées consolidées, décisions, actions | **Revues direction** |
| 10.2 Non-conformité, actions correctives | NC, plan CAPA, vérification d'efficacité, clôture | **Non-conformités** |

Les limites connues (ce qui n'existe pas encore) sont listées au §8, avec les contournements.

---

## 2. Les rôles : qui voit quoi, qui peut quoi

### 2.1 Les rôles et ce qu'ils font

| Rôle (libellé à l'écran) | Mission | Remarque |
|---|---|---|
| **Administrateur tenant** | Invite et suspend les comptes, attribue les rôles, approuve workflows et documents, approuve les non-applicabilités | Compte créé à l'ouverture de l'entreprise |
| **Responsable qualité** (RQ) | Pilote le système : lance et assigne les actions, valide ou rejette, traite NC et CAPA, approuve les documents, planifie les audits, tient les revues de direction | Ne gère pas les comptes |
| **Responsable de site** / **Responsable de département** | Assigne, exécute et valide dans son périmètre, crée brouillons de workflows et de documents, répond aux constats d'audit | Pas de CAPA, pas d'approbation de documents/workflows |
| **Responsable de processus** (PO) / **Opérateur** | Exécute les actions assignées, joint les preuves, déclare une exception, répond aux constats d'audit | Ne valide rien |
| **Auditeur interne** | Planifie et conduit les audits internes, consulte journal, rapports, revues (lecture), voit toutes les actions | Ne répond pas aux constats (indépendance) |
| **Consultant** | Rédige workflows et documents, renseigne la matrice, lance des actions, exporte | Ne valide rien — voir cahier n° 3 |
| **Auditeur externe** | Consulte tout le dossier en lecture seule — voir cahier n° 2 | Aucun bouton d'écriture |
| **Lecteur** | Consulte les écrans communs | Aucune action |

Les rôles « Super administrateur » et « Administrateur technique » sont des rôles de **plateforme** (hors entreprise) ; ils n'apparaissent pas dans la liste d'invitation.

### 2.2 Le menu de chaque rôle

Le menu de gauche ne montre que les écrans autorisés. **Tableau de bord, Mes actions, Non-conformités, Matrice ISO** sont communs à tous.

| Écran | Admin | RQ | Site / Dépt | PO / Opérateur | Aud. interne | Consultant | Aud. externe | Lecteur |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Prêt audit | ● | ● |  |  | ● | ● | ● |  |
| Bibliothèque WF | ● | ● | ● | ● (lecture) | ● (lecture) | ● | ● (lecture) | ● (lecture) |
| Utilisateurs | ● |  |  |  |  |  |  |  |
| Rapports | ● | ● | ● | | ● | ● | ● |  |
| Documents | ● | ● | ● | ● (lecture) | ● (lecture) | ● | ● (lecture) | ● (lecture) |
| Audits internes | ● | ● | ● (répondre) | ● (répondre) | ● | | ● (lecture) | |
| Revues direction | ● | ● |  |  | ● (lecture) |  | ● (lecture) |  |

Le détail de chaque droit est en **annexe A**.

### 2.3 La règle d'or : la séparation des tâches

**On ne valide jamais son propre travail.** Le serveur le contrôle et journalise le refus (événements « … refusé (séparation des tâches) » dans **Prêt audit**).

| Ce qu'on fait | Qui ne peut PAS le faire |
|---|---|
| Valider une action | La personne assignée, ni quiconque a saisi une étape de cette action |
| Approuver un document | L'auteur, le soumetteur, tout contributeur |
| Approuver un workflow | Le créateur, le soumetteur, tout contributeur |
| Approuver une non-applicabilité (matrice) | Celui qui l'a demandée |
| Planifier un audit dont on est l'auditeur | Le planificateur lui-même (« Auditeur (≠ vous) ») |
| Vérifier l'efficacité d'une réponse d'audit | Celui qui a répondu, ni le responsable de processus désigné |
| Changer son propre rôle | Personne (l'administrateur ne peut pas modifier le sien) |

*Non imposé par le logiciel :* la vérification d'efficacité d'une **CAPA** n'exige pas une personne distincte de l'auteur du plan. **Bonne pratique : la faire faire par quelqu'un d'autre.**

### 2.4 L'équipe minimale

Pour qu'une action puisse vivre de bout en bout il faut au minimum : **1 administrateur**, **1 RQ**, **1 exécutant** (PO ou opérateur). Recommandé : **1 auditeur interne distinct du RQ**, et un PO par processus clé. Le guide de l'écran **Utilisateurs** vérifie cela pour vous (« Responsable qualité présent », « 1 exécutant actif », « Auditeur interne présent »).

---

## 3. Première connexion

### 3.1 L'ouverture de l'entreprise (faite par l'opérateur de la plateforme)

Il n'y a pas d'inscription libre. L'opérateur de la plateforme (ou le cabinet qui vous accompagne) crée votre entreprise et invite votre administrateur avec la commande `tenant:create` ([DEPLOIEMENT.md §14](../DEPLOIEMENT.md)). **Vous n'avez rien à faire pour cela** : vous recevez un e-mail.

### 3.2 L'invitation : choisir son mot de passe

1. Ouvrez l'e-mail « Invitation à rejoindre QualiDji » et cliquez le lien. **Le lien ne sert qu'une fois et expire.**
2. La page **Choisissez votre mot de passe** s'ouvre ([capture](img/03-definir-mot-de-passe.png)). Saisissez **Nouveau mot de passe** (12 caractères minimum) et **Confirmer le mot de passe**, puis **Enregistrer et accéder à mon espace**.
3. **Résultat attendu :** vous arrivez sur le **Tableau de bord** ([capture](img/04-premier-acces-tableau-de-bord.png)) ; en haut de l'écran, sous le titre, figurent votre rôle et votre espace.
4. Si la page affiche « *Ce lien est invalide ou a expiré* » : le lien a déjà servi ou a expiré. Utilisez **Mot de passe oublié ?** (§3.3) ou demandez une nouvelle invitation à votre administrateur.

### 3.3 Se connecter, mot de passe oublié

* Page de connexion ([capture](img/01-connexion.png)) : **Email professionnel**, **Mot de passe**, **Se connecter**.
* **Mot de passe oublié ?** ([capture](img/02-mot-de-passe-oublie.png)) : saisissez votre e-mail, **Envoyer le lien**. Le message est toujours le même, que le compte existe ou non (« *Si un compte existe pour cette adresse, un e-mail vient d'être envoyé* »). Le lien ouvre la même page « Choisissez votre mot de passe ».
* Un quota d'envoi d'e-mails existe côté fournisseur : si l'écran dit « *Trop de demandes d'e-mail : réessayez dans quelques minutes* », patientez.
* Il n'y a **pas** de compte de démonstration ni d'authentification à deux facteurs.

### 3.4 L'écran, ses repères

* **Menu de gauche** : les écrans autorisés ; en bas **Déconnexion** (efface aussi la file hors ligne en attente : attendez la synchronisation avant de vous déconnecter).
* **En-tête** : titre de l'écran, puis « *rôle · espace* » (Personnel interne, Consultant, Auditeur externe), la **cloche** des notifications, votre nom et e-mail.
* **Bandeau bleu « Que faire ici ? »** : voir §3.6.
* Sur téléphone, le menu s'ouvre par le bouton en haut à gauche.

### 3.5 Les notifications (la cloche)

La cloche affiche le nombre de notifications non lues (« 9+ » au-delà). Elle se rafraîchit toutes les 60 secondes et à chaque changement d'écran. Cliquez-la : [capture](img/29-notifications.png).

* **Tout marquer lu** vide le compteur ; cliquer une notification la marque lue **et ouvre l'objet concerné** (action, NC, workflow…).
* Notifications existantes : **Action assignée** (à l'exécutant), **Action soumise** (aux responsables qualité), **Action bloquée**, **Non-conformité** (aux responsables qualité et administrateurs), **Approbation requise** (aux administrateurs, pour un workflow soumis), **Workflow publié / rejeté** (à son auteur), action approuvée, constat d'audit (au responsable désigné).
* Il n'y a **pas d'e-mail de notification** : seuls l'invitation et la réinitialisation de mot de passe partent par e-mail.

### 3.6 « Que faire ici ? » et « Comment faire… ? »

Sur chaque écran, le bandeau **Que faire ici ?** calcule, à partir de vos droits et de l'état réel de l'entreprise, **la prochaine étape** (« MAINTENANT … ») et les repères à lire. Les boutons ↻ (actualiser) et ⌃ (réduire) sont à droite ; votre choix de réduction est mémorisé.

* Sous les étapes, **Notice :** renvoie à la section de la notice d'utilisation à relire.
* **Comment faire… ?** est une question libre (3 à 500 caractères) : la réponse vient de la notice et des documents **publiés non confidentiels** ; elle est **refusée** si elle contient un e-mail, un téléphone ou un IBAN. Elle consomme le quota d'IA seulement si un fournisseur IA est branché.

### 3.7 Hors ligne

Sans réseau, **la saisie d'une étape** est gardée sur l'appareil et rejouée au retour du réseau (bandeaux « *Mode hors ligne — vos saisies sont conservées localement* » puis « *Synchronisation de n saisie(s) en attente…* »). **Le dépôt d'un fichier de preuve exige le réseau.** Ne fermez pas la session avant la fin de la synchronisation.

---

## 4. Feuille de route d'implémentation, étape par étape

Chaque étape donne : l'objectif, qui agit, le chemin à l'écran, le pas à pas, le résultat attendu, le contrôle à faire. L'ordre est celui qui évite les blocages.

### Étape 1 — Constituer l'équipe *(Administrateur)* — écran **Utilisateurs**

**Objectif :** disposer au minimum d'un RQ, d'un exécutant, et idéalement d'un auditeur interne.

1. Menu **Utilisateurs** ([capture](img/11-admin-utilisateurs.png)) : la liste montre E-mail, Nom, Rôle, Statut, Dernière connexion, Actions.
2. **Inviter** ([capture](img/12-admin-inviter.png)) : **E-mail \***, **Rôle \*** (liste de 10 rôles), **Nom affiché**, puis **Envoyer l'invitation** (actif seulement si l'e-mail est valide).
3. **Résultat attendu :** bandeau vert « *Invitation envoyée à …* » ; la ligne apparaît avec le statut **Actif** et « — » comme dernière connexion jusqu'à la première connexion.
4. **Changer un rôle** : modifiez la liste déroulante de la ligne ; une bande jaune s'ouvre ([capture](img/13-admin-changement-de-role.png)) : saisissez le **Motif du changement de rôle \*** puis **Confirmer le changement** (ou **Annuler**). **Règle :** motif obligatoire ; on ne peut pas modifier son propre rôle (liste grisée sur votre ligne).
5. **Historique** : cliquez l'e-mail d'un utilisateur pour déplier « Historique des rôles » (date · ancien rôle barré → nouveau rôle — motif).
6. **Suspendre** (icône ⊘) : les sessions de la personne sont **révoquées immédiatement** ; **Réactiver** (icône ✓) la rétablit. On ne se suspend pas soi-même. **Un compte n'est jamais supprimé** : ses traces restent rattachées à une personne.

**Contrôle :** le bandeau « Que faire ici ? » affiche trois coches vertes.
**Pièges :** l'e-mail d'invitation peut être bloqué par le quota du fournisseur (message « quota d'envoi d'e-mails … réessayer plus tard ») ; un e-mail déjà existant renvoie « utilisateur déjà existant ». Une personne ne peut appartenir qu'**à une seule** entreprise.

### Étape 2 — Cadrer le périmètre : la Matrice ISO *(RQ ou consultant ; l'administrateur approuve)* — écran **Matrice ISO**

**Objectif :** pour chacune des 54 exigences, décider si elle s'applique, qui en répond, quelle preuve l'atteste, comment la vérifier.

1. Menu **Matrice ISO** ([capture](img/18-matrice.png)). Un avertissement rappelle que cet état de préparation « *ne vaut ni audit indépendant ni certification* ».
2. Lisez les quatre cartes : **Exigences applicables**, **Testées conformes**, **Lacunes bloquantes**, **Non applicables justifiées**, puis les tableaux **Couverture par clause** et **Couverture par espace**.
3. Filtrez par **Clause**, **Espace** (Consultant / Personnel / Auditeur externe), **Statut de couverture**.
4. Cliquez une ligne du **Registre des exigences** : le panneau latéral s'ouvre ([capture](img/64-matrice-fiche.png)).
5. **Fonction, preuve et contrôle (K.2)** : **Responsable**, **Contrôle logiciel**, **Preuve attendue**, **Méthode de vérification**.
6. **Tests d'acceptation (K.3)** ([capture](img/65-matrice-tests.png)) : pour **Positif** et **Négatif**, cliquez **Non exécuté**, **Conforme ✓** ou **Non conforme ✗**. Les deux sont obligatoires avant qu'une exigence soit « couverte ».
7. **Applicabilité (K.4)** : **Applicable**, **En cours de revue (non analysé)** ou **Non applicable (justification obligatoire)**. Dans ce dernier cas ([capture](img/66-matrice-non-applicable.png)), rédigez la **Justification motivée**.
8. **Motif de la modification (obligatoire — L.5)** puis **Enregistrer la ligne**. Chaque enregistrement exige un motif (3 caractères minimum).
9. **Approbation d'une non-applicabilité** : un autre utilisateur habilité (administrateur ou RQ) rouvre la ligne et clique **Approuver la non-applicabilité**. Tant qu'elle n'est pas approuvée, la ligne reste une lacune bloquante.
10. **Workflows et modules liés** (en haut du panneau) : la carte « exigence ↔ processus de **votre** entreprise ». **Ajouter un lien** : **Type de lien** (Workflow / Module), **Couverture**, **Cible**, **Motif**, **Ajouter le lien** ; **Retirer** / **Écarter** une suggestion (motif obligatoire). **Ces liens sont informatifs** : un lien manquant produit un avertissement, jamais un blocage.
11. **Exporter (CSV)** produit la matrice (réservé aux porteurs de « exporter une preuve ou un registre » : tous sauf PO, opérateur, lecteur).

**Résultat attendu :** les compteurs de lacunes diminuent ; une ligne complète passe à « Testé conforme ».
**Qui modifie :** ceux qui peuvent modifier un brouillon de workflow (administrateur, RQ, responsables de site/département, consultant). Les autres voient « *Consultation seule* ».
**Piège :** le catalogue des exigences doit être **confirmé sur un exemplaire autorisé de la norme** ; QualiDji n'en tient pas lieu.

### Étape 3 — Adapter les processus : la Bibliothèque WF *(RQ / consultant rédige ; administrateur ou RQ approuve)* — écran **Bibliothèque WF**

**Objectif :** disposer de workflows **publiés** — seuls eux servent à lancer des actions.

> **À savoir :** la plateforme fournit **un seul** workflow global, **WF_CONTEXT_ANALYSIS** (clause 4.1, « Analyse du contexte organisationnel »). Les autres processus sont à **définir par l'entreprise** (voir `docs/BACKLOG_CONTENU_METIER.md`).

1. Menu **Bibliothèque WF** ([capture](img/15-bibliotheque-workflows.png)). Les onglets **Publié / Tous / Brouillon / En revue / Déprécié** filtrent ; les auteurs voient les publiés **et leurs propres brouillons**.
2. Le workflow global porte le badge **global** : il est en lecture seule. Cliquez l'icône **Dupliquer (nouvelle version, motif requis)** ([capture](img/60-dupliquer-motif.png)), saisissez le **Motif**, **Créer la version** : une copie **Brouillon** de votre entreprise est créée (code `WF_…_V2__xxxxxxxx`).
3. **Éditer le brouillon** (icône crayon) : l'éditeur ([capture](img/61-editeur-workflow.png)) :
   * en-tête : **Nom du workflow \***, **Clause ISO \***, **Fréquence** (À évènement / Annuelle / Continue), **Propriétaire (rôle)**, **Code** (facultatif, à la création) ;
   * **Action n** : **Titre \***, **Objectif \***, **Rôle exécutant**, **Retirer** ; **+ Ajouter une action** ;
   * **Étape n** : **Requise**, **Titre de l'étape \***, **type** (16 types, tableau ci-dessous), **Règle** (ex. `min_length:50`), **Instruction opérateur \***, **Retirer**, **+ Ajouter une étape** ;
   * options selon le type : **Choix proposés \*** (un par ligne) et **Justification obligatoire si le choix est…** + **Longueur minimale** (type Choix) ; **Rôle approbateur** et **Approbateur distinct de l'exécutant** (type Approbation) ; **Guidage IA disponible pour cette étape** ;
   * **Enregistrer le brouillon** (ou **Créer le brouillon**).
4. **Soumettre en revue** (icône avion) : le workflow passe **En revue** ; les administrateurs sont notifiés.
5. **Un autre utilisateur** (administrateur ou RQ, ni auteur ni contributeur) clique **Approuver (publication)** — ou **Rejeter (motif requis)** : le workflow revient en brouillon avec « *Dernier rejet : …* ».
6. **Résultat attendu :** statut **Publié** ; le workflow apparaît dans la liste de **Nouvelle action**.
7. **Faire évoluer un workflow publié :** **Dupliquer** (motif obligatoire) — jamais de modification en place. **L'ancienne version reste Publiée** (et proposée dans **Nouvelle action**) jusqu'à ce que vous la **Dépréciez** (motif) : faites-le après la publication de la nouvelle. **Supprimer** n'est possible que pour un workflow jamais publié et jamais utilisé.

**Les 16 types d'étape et ce que voit l'exécutant :**

| Type (éditeur) | Ce qu'on saisit | Valeur enregistrée |
|---|---|---|
| Instruction | **Marquer comme lue** | vrai |
| Texte / Question de connaissance | zone de texte | texte |
| Nombre / Capteur | champ numérique | nombre (règles `min:N`, `max:N`) |
| Choix | boutons radio (+ justification si garde-fou) | le choix, ou {choix, justification} |
| Case à cocher | case **Case cochée** | vrai / faux |
| Confirmation | case **Je confirme** (doit être cochée si l'étape est requise) | vrai |
| Date | sélecteur de date | AAAA-MM-JJ |
| Signature | **Nom du signataire** | texte |
| Photo / Fichier | **Description** de la pièce ; la pièce se joint dans **Preuves** | texte |
| Code-barres / QR code | code lu | texte |
| Position | lieu constaté | texte |
| Approbation | **non saisissable** : tranchée par l'approbateur après la soumission | décision de l'approbateur |

**Règles de validation** (grammaire fermée, refusée à l'enregistrement sinon) : `min_length:N`, `max_length:N` (texte) ; `min:N`, `max:N` (nombre).

### Étape 4 — Maîtriser les documents *(rédacteurs ; RQ / administrateur approuvent)* — écran **Documents**

**Objectif :** un registre de documents en vigueur, versionné, dont **une seule version est publiée** à la fois.

1. Menu **Documents** ([capture](img/17-documents.png)). Les non-approbateurs cochent **Afficher mes brouillons** ; les approbateurs **Afficher brouillons/retirés**.
2. **Nouveau document** ([capture](img/62-document-nouveau.png)) : **Titre \*** (3 car. min.), **Type** (Procédure, Politique, Instruction de travail, Formulaire, Référence d'enregistrement, Autre), **Classification** (Public, Interne, Confidentiel, Secret), **Extrait indexable \*** — un résumé opérationnel (objet, étapes clés, seuils) **sans donnée personnelle** ; il alimente l'assistant IA. **Créer le brouillon**.
3. Dans la ligne : **Éditer** (brouillon), **Soumettre en revue**. Un non-approbateur ne voit pas le brouillon d'un autre.
4. **Approuver (publication)** — par une autre personne que l'auteur/soumetteur — ou **Rejeter** (motif de 5 caractères minimum, « *Dernier rejet : …* » visible).
5. Cliquez la clé (ex. `DOC_E28D9D`) : extrait, motif, **Historique des versions**.
6. **Nouvelle version** (motif) sur un document publié ou en revue ; **Déprécier** (motif de retrait) ; **Supprimer** (confirmation **Confirmer ?**) seulement pour brouillon/en revue ; **un document publié ou déprécié n'est jamais supprimé**.

**Résultat attendu :** statut **Publié** ; l'ancienne version devient **Déprécié**.
**Classification :** un document **Confidentiel** n'est lisible en entier que par les approbateurs, l'auteur et le rôle propriétaire (les autres voient « restreint », sans extrait) ; un document **Secret** est **invisible** pour les autres.
**Limite importante :** QualiDji tient le **registre et le résumé** du document ; il **ne stocke pas le fichier** (PDF, Word). Conservez le fichier maître dans votre GED et indiquez sa référence dans l'extrait.

### Étape 5 — Lancer et exécuter les actions *(RQ lance ; PO / opérateur exécute)*

**5a. Lancer (RQ, responsables de site/département, administrateur, consultant).**
1. **Tableau de bord → Nouvelle action** ([capture](img/67-nouvelle-action.png)).
2. **Workflow \*** (workflows publiés), **Action \*** (le rôle prévu s'affiche), **Assigner à \*** (personnes actives pouvant exécuter ; le rôle prévu en premier), **Échéance** (facultative).
3. **Lancer l'action** : l'action est **Assignée**, l'exécutant est notifié.
*Si « Assigner à » est vide :* « *Aucun exécutant actif dans l'entreprise : invitez d'abord un responsable de processus ou un opérateur.* »

**5b. Exécuter (PO / opérateur).**
1. **Tableau de bord** ou **Mes actions** : cliquez **Ouvrir** sur l'action ([captures](img/68-action-etapes.png)).
2. Pour chaque étape : lisez l'instruction et la **Contrainte** (ex. « Au moins 50 caractères ») ; saisissez ; **Soumettre l'étape** (le badge **Saisie enregistrée** apparaît). La première saisie fait passer l'action **En cours**.
3. **Preuves & guidage IA** (lien sous chaque étape) : déplie
   * **Guidage IA** → **Générer le guidage** ([capture](img/70-guidage-ia.png)) : suggestions **non approuvées** à vérifier. Sans fournisseur IA branché, le bandeau « *Mode standard (IA indisponible…)* » indique que le guidage vient d'un gabarit : le formulaire reste pleinement utilisable. Quotas : 30 demandes par heure et par utilisateur, 500 par jour et par entreprise (par défaut) ;
   * **Preuves à joindre** ([capture](img/69-preuve-jointe.png)) : choisissez un ou plusieurs fichiers (photo, PDF, tableur, texte — **25 Mo maximum**), **Joindre n preuve(s)**. Le navigateur calcule l'empreinte **SHA-256**, le serveur la recalcule et **refuse le dépôt si elle diffère**. Ensuite **Vérifier** (affiche « intègre » ou « ALTÉRÉ ») et **Télécharger** (lien signé de courte durée).
4. Quand toutes les étapes **obligatoires** sont saisies : **Soumettre l'action complète**. Statut **Soumise** ; les RQ sont notifiés. Si une étape obligatoire manque, le serveur répond « *étapes obligatoires non saisies* » et liste lesquelles.
5. **Un problème sur le terrain ?** **Déclarer une exception** ([capture](img/71-exception.png)) : **Motif de l'exception** (quoi, où, quand, impact), **Gravité** (Mineure / Majeure / Critique), **Déclarer et créer la NC**. **Résultat :** l'action passe **Bloquée** et une **non-conformité** est créée automatiquement (« Exception sur action … »).
6. Une action **rejetée** revient **En cours** avec la bande « *Action rejetée — à corriger : …* » : corrigez les étapes citées puis soumettez de nouveau.

**5c. Valider (RQ, responsables de site/département, administrateur — jamais l'exécutant).**
1. Ouvrez l'action **Soumise** ([capture](img/79-validation-action.png)) ; relisez chaque réponse ; ouvrez les preuves (**Voir les preuves**).
2. Bloc **Validation de l'action** : **Commentaire** puis **Approuver**, ou **Rejeter** (commentaire de 3 caractères minimum, obligatoire).
3. **Règles :** la personne assignée (et quiconque a saisi une étape) ne peut pas valider (« *ségrégation des tâches* ») ; si la définition de l'étape d'approbation fixe un **rôle approbateur**, seul ce rôle (ou l'administrateur) peut approuver.
4. **Résultat attendu :** bande verte « *Action approuvée le … — commentaire* » ; l'exécutant est notifié.
5. **Réassigner** (absence, surcharge) : panneau **Contexte de l'action → Réassigner à → Réassigner**, tant que l'action est Assignée, En cours ou Bloquée.

### Étape 6 — Traiter les écarts : NC et CAPA *(RQ / administrateur)* — écran **Non-conformités**

1. Menu **Non-conformités** ([capture](img/23-non-conformites.png)). Les NC naissent d'une exception, ou par **Nouvelle NC** (RQ, responsables, administrateur) : **Titre de l'écart**, **Gravité**, **Créer la NC**.
2. Cliquez la NC ([capture](img/72-nc-capa-formulaire.png)) puis **Lancer un plan CAPA** : **Cause racine \***, **Action corrective \***, **Responsable** (texte libre), **échéance** ; **Enregistrer le CAPA**. **Résultat :** la NC passe **En cours**.
3. Quand l'action corrective est réalisée, **vérifiez son efficacité** ([capture](img/73-capa-verification.png)) : saisissez le constat de la vérification, puis
   * **Efficacité vérifiée** → la CAPA est « Efficacité vérifiée » et la **NC est clôturée** ([capture](img/74-nc-cloturee.png)) ;
   * **Inefficace — rouvrir** (commentaire obligatoire) → la CAPA est « Rouvert », la NC reste **En cours** ; reprenez l'action.
4. Les CAPA en retard apparaissent dans **Rapports** et dans le guide.

**Règle :** seuls les rôles « clôturer une CAPA » (administrateur, RQ) créent un plan et vérifient son efficacité ; les autres lisent.

### Étape 7 — L'audit interne *(RQ planifie ; auditeur conduit ; PO répond)* — écran **Audits internes**

Six temps : **planifier, démarrer, constater, répondre, vérifier, clôturer**.

1. **Planifier un audit** (RQ, administrateur, auditeur interne) ([capture](img/75-audit-planifier.png)) : **Titre \***, **Auditeur (≠ vous, §F.4) \***, **Périmètre / scope \***, **Critères (référentiel, clauses) \***, **Planifier**. L'auditeur doit être administrateur, RQ ou auditeur interne, **et une autre personne que vous**.
2. **Démarrer** (tout titulaire du droit de gérer les audits, en pratique l'auditeur désigné) : statut **En cours**.
3. **+ Constat** (l'auditeur) ([capture](img/76-audit-constat.png)) : **Titre du constat \***, **Faits observés** (**non modifiables après création**), classification **Mineur / Majeur / Observation**, **Responsable de processus** (notifié ; il doit pouvoir répondre — RQ, responsables de site/département, PO ou opérateur, sinon le serveur refuse), **Enregistrer le constat**.
4. **Répondre** (le responsable désigné, ou tout répondant si aucun n'est désigné) ([capture](img/77-audit-repondre.png)) : **Réponse factuelle \*** et **Action corrective proposée**, **Envoyer la réponse**. Le constat d'origine reste inchangé.
5. **Efficacité vérifiée** ou **Inefficace — réouvrir** (titulaire du droit de gérer les audits, **jamais celui qui a répondu ni le responsable de processus désigné**). Après réouverture : **Vérifier après nouvelle réponse**.
6. **Clôturer** ([capture](img/78-audit-cloture.png)) : possible quand tous les constats sont vérifiés efficaces ; **Synthèse de clôture \*** obligatoire.

**Résultat attendu :** audit **Clôturé**, constats « Efficacité vérifiée ». **Piège :** si un constat reste ouvert, répondu ou réouvert, le serveur refuse la clôture.

### Étape 8 — La revue de direction *(RQ, administrateur)* — écran **Revues direction**

1. **Titre de la revue \*** puis **Créer** : revue **Brouillon**.
2. Cliquez la revue pour la déplier, puis **Consolider les entrées** : le serveur rassemble les chiffres enregistrés ([capture](img/27-revue-direction.png)) — actions (par statut, retards), NC et CAPA (gravité, ouvertes, en retard, efficacité non conforme), audits internes (total, clôturés) ; la mention indique la date, l'auteur et « aucun texte IA ».
3. **Décisions** : **Nouvelle décision…** puis **+**. **Actions issues de la revue** : **Nouvelle action avec responsable…** puis **+** (texte libre : indiquez le responsable et l'échéance dans le texte). ✕ retire un élément tant que la revue est en brouillon.
4. **Marquer tenue** : possible seulement avec **entrées consolidées ET au moins une décision** ; la revue est alors **figée** (statut **Tenue**).

**À compléter hors QualiDji :** les entrées de la clause 9.3 qui ne sont pas des données de la plateforme (satisfaction client, atteinte des objectifs, performance des fournisseurs, risques, changements, ressources) sont à consigner en **décisions** ou dans un document joint à la revue.

### Étape 9 — Préparer la certification *(RQ, administrateur, auditeur interne)* — écrans **Rapports** et **Prêt audit**

1. **Rapports** ([capture](img/24-rapports.png)) : filtres **Statut**, **Créé après**, **Créé avant** (**Réinitialiser**) ; **Rapport d'actions** (total, par statut, en retard ; tableau Workflow, Titre, Responsable, Statut, Échéance, Ancienneté — 50 lignes affichées) ; **Registre NC & CAPA** (NC au total, ouvertes, par gravité, CAPA en retard, « Efficacité non conforme »).
2. Boutons d'export (pour les porteurs de « exporter le journal d'audit ») : **CSV actions**, **CSV NC/CAPA**, **CSV journal d'audit**, **Paquet d'audit** ([capture](img/25-paquet-audit.png) : workflows publiés, exigences évaluées, taux d'évaluation, actions, NC, CAPA, derniers événements). **Chaque CSV porte en tête la date d'extraction, l'exportateur et les filtres.** Chaque export est lui-même journalisé.
3. **Prêt audit** ([capture](img/26-pret-audit.png)) : le **Journal d'audit** — pour chaque événement : libellé en clair, **auteur**, objet, date et heure. Compteurs : **Événements d'audit**, **Preuves déposées**, **Étapes saisies**. **Journal complet (CSV)** exporte *tout* le journal dans l'ordre chronologique ; **Actualiser** recharge.
4. **Avant la venue de l'auditeur :** viser **zéro lacune bloquante** dans la **Matrice ISO**, aucune NC ouverte sans CAPA, aucune action en retard, au moins un audit interne clôturé et une revue de direction tenue sur la période.

### Étape 10 — Recevoir l'auditeur externe

1. **Utilisateurs → Inviter** : e-mail de l'auditeur, rôle **Auditeur externe**. Il choisit son mot de passe (§3.2) et voit **tout le dossier en lecture seule** : voir [cahier n° 2](02-cahier-auditeur-externe.md).
2. **Après l'audit :** **Suspendre** son compte (les sessions sont coupées, la trace reste). Les constats de l'auditeur externe se traitent en **NC** (Étape 6) : QualiDji ne les saisit pas comme un audit externe.

---

## 5. Référence écran par écran

Pour chaque écran : l'objet, qui le voit, les boutons et champs, les règles. Les pas à pas détaillés sont au §4.

### 5.1 Tableau de bord — *tous les rôles*
**Contenu :** titre, « *Bonjour {nom} — {rôle}* », **Nouvelle action** (pour qui peut assigner), lien **Ouvrir mes actions**, 4 compteurs (**Actions totales**, **En cours** = assignées + en cours, **Soumises / validées**, **Bloquées**), liste **Mes actions** avec statut et **Ouvrir**. Si vous avez plus de 50 actions, une note précise que les compteurs portent sur les 50 plus récentes.
**Vide :** « *Aucune action assignée* ».

### 5.2 Mes actions — *tous les rôles* ([capture](img/21-mes-actions.png))
La liste complète, filtrable : **Toutes, Assignées, En cours, Soumises, Bloquées, Approuvées**. L'exécutant voit **ses** actions ; les gestionnaires et les auditeurs voient **toutes** celles de l'entreprise. Pages de 50 : **Afficher les actions suivantes**.

### 5.3 Détail d'une action — *voir §4 étape 5* ([capture](img/22-action-approuvee.png))
En-tête (titre, workflow • clause • rôle propriétaire, statut) ; bandes d'état (Bloquée / Rejetée / Approuvée) ; **Validation de l'action** (si soumise et droit de valider) ; une carte par étape ; colonne droite : **Contexte de l'action** (Référence, **Assignée à** — nom en clair, Créée le, Soumise le, **Réassigner à**), **Guidage IA**, **Non-conformité / Déclarer une exception** (visibles seulement pour qui peut exécuter ou valider). Pour un lecteur ou un auditeur, les champs sont désactivés et le lien devient **Voir les preuves** (liste, **Vérifier**, **Télécharger**).

### 5.4 Non-conformités — *tous les rôles ; actions selon les droits* — §4 étape 6
### 5.5 Prêt audit — *droit « exporter le journal d'audit »* — §4 étape 9
### 5.6 Matrice ISO — *tous les rôles ; modification selon les droits* — §4 étape 2
### 5.7 Bibliothèque WF — *lecture : tous ; rédaction : administrateur, RQ, responsables, consultant* — §4 étape 3
### 5.8 Utilisateurs — *administrateur uniquement* — §4 étape 1
### 5.9 Rapports — *administrateur, RQ, responsables de site/département, auditeurs, consultant* — §4 étape 9
### 5.10 Documents — *lecture : tous ; rédaction : administrateur, RQ, responsables, consultant* — §4 étape 4
### 5.11 Audits internes — *gérer : administrateur, RQ, auditeur interne ; répondre : RQ, responsables, PO, opérateur ; lire : auditeur externe* — §4 étape 7
### 5.12 Revues direction — *gérer : administrateur, RQ ; lire : auditeurs* — §4 étape 8

---

## 6. Règles de gestion et cycles de vie

### 6.1 Statuts et transitions

| Objet | Statuts et transitions |
|---|---|
| **Action** | Assignée → En cours (1re saisie) → **Soumise** → **Approuvée**. Soumise → rejet → En cours. Toute action non soumise → **Bloquée** (exception) ; réassignable tant qu'elle n'est pas soumise/terminée |
| **Non-conformité** | Ouverte → **En cours** (CAPA enregistrée) → **Clôturée** (CAPA vérifiée efficace) ; CAPA inefficace → reste En cours |
| **CAPA** | Ouvert → **Efficacité vérifiée** ; ou → **Rouvert** → (nouvelle vérification) |
| **Workflow** | Brouillon → En revue → **Publié** → Déprécié (à faire à la main pour l'ancienne version) ; En revue → rejet → Brouillon |
| **Document** | Brouillon → En revue → **Publié** → Déprécié (la version précédente est dépréciée à la publication) |
| **Audit interne** | Planifié → En cours → Clôturé |
| **Constat** | Ouvert → Répondu → **Efficacité vérifiée** (ou Réouvert → Répondu …) |
| **Revue de direction** | Brouillon → **Tenue** (figée) |

### 6.2 Les motifs obligatoires
Rejet (action, document, workflow), nouvelle version / dépréciation (workflow, document), modification d'une ligne de matrice, ajout/retrait d'un lien de la carte, changement de rôle, constat inefficace, clôture d'audit (synthèse), exception (motif). **Les motifs sont conservés et visibles dans les historiques.**

### 6.3 Ce qui ne se modifie jamais
Le **journal d'audit**, les **interventions de l'IA**, les **preuves** (empreinte SHA-256 fixée au dépôt), les **faits observés d'un constat**, une **revue tenue**, un **document ou workflow publié** (on duplique), un **compte** (on le suspend).

### 6.4 L'IA
Elle **suggère** sur une étape **existante** ; elle ne crée aucun workflow, n'approuve rien, ne lance aucune action. Les suggestions sont toujours « non approuvées ». Une instruction suspecte dans le contexte (injection) est **refusée** et journalisée. **Ne saisissez aucune donnée personnelle** dans le contexte, les résumés de documents ou les questions. Sans fournisseur branché, le mode « gabarit » s'applique.

---

## 7. Messages fréquents et que faire

| Message | Cause | Que faire |
|---|---|---|
| *missing permission: …* (403) | Votre rôle n'a pas ce droit | Demandez le rôle adapté à l'administrateur (avec motif) |
| *ségrégation des tâches : l'approbateur ne peut pas être la personne qui a exécuté l'action* | Vous avez travaillé sur cette action | Faites valider par un autre RQ/administrateur |
| *approbation réservée au rôle …* | L'étape d'approbation fixe un rôle | L'administrateur ou ce rôle valide |
| *étapes obligatoires non saisies* | Soumission d'action incomplète | Saisissez les étapes listées |
| *saisie impossible : statut …* / *dépôt impossible : statut …* | L'action est soumise, approuvée ou terminée | Faites rejeter l'action pour la corriger |
| *une réponse est obligatoire pour cette étape* | Étape obligatoire vide | Saisissez la réponse |
| *au moins N caractères requis* / *valeur maximale N* | Règle de l'étape | Ajustez la saisie |
| *justification d'au moins N caractères obligatoire pour ce choix* | Garde-fou du choix | Rédigez la justification |
| *quota IA atteint …* (429) | 30/h par utilisateur ou 500/j par entreprise | Réessayez plus tard ; le formulaire reste utilisable |
| *instruction non autorisée détectée dans le contexte (R8)* | Texte suspect dans le contexte IA | Reformulez, sans consignes adressées à l'IA |
| *motif obligatoire pour un changement de rôle* | Motif vide | Saisissez le motif |
| *impossible de modifier son propre rôle* | Auto-modification | Demandez à un autre administrateur |
| *un document publié … n'est jamais supprimé* | Suppression d'un document publié | **Déprécier** |
| *quota d'envoi d'e-mails du fournisseur d'identité atteint* | Plafond d'envoi d'invitations | Réessayez dans une heure |
| *utilisateur déjà existant* | E-mail déjà inscrit | Modifiez le rôle de l'existant |
| Clôture d'audit refusée | Constat non vérifié efficace | Traitez chaque constat |
| « Marquer tenue » refusé | Pas d'entrées ou pas de décision | **Consolider les entrées**, ajoutez une décision |

---

## 8. Limites actuelles et contournements

| Besoin | Situation | Contournement |
|---|---|---|
| Créer son entreprise soi-même | Non : script d'ouverture côté opérateur | Demander à l'opérateur / au cabinet |
| Un utilisateur dans plusieurs entreprises | Non : un compte = une entreprise | Un compte par entreprise |
| Workflows prêts à l'emploi | **1 seul** workflow global (clause 4.1) | Les rédiger (consultant, RQ) |
| Joindre le fichier d'un document | Non : résumé uniquement | GED externe + référence dans l'extrait |
| Programme annuel d'audits, check-lists par clause | Non | Un audit par processus ; critères en texte |
| Constat lié à une clause | Non (texte libre dans le périmètre/critères) | Citer la clause dans le titre |
| Responsable et échéance d'une action de revue | Texte libre | Les écrire dans la phrase |
| Entrées 9.3 hors plateforme, objectifs qualité, risques, compétences, fournisseurs, satisfaction client | Pas de module dédié | Workflows + documents + décisions de revue |
| Notifications par e-mail | Non | Cloche seulement |
| Export PDF | Non : CSV | Impression navigateur |
| Mode hors ligne pour les fichiers | Non | Réseau requis |
| Authentification à deux facteurs | Non | Mot de passe de 12 caractères + suspension rapide |
| Constats de l'auditeur externe | Non saisis comme tels | Les traiter en NC |

---

## 9. Check-lists

**Démarrage (semaine 1)** — ☐ Équipe invitée (RQ, exécutants, auditeur interne) ☐ Mots de passe choisis ☐ Matrice : applicabilité des 54 lignes statuée ☐ Workflow 4.1 dupliqué, adapté, publié ☐ Premiers documents publiés ☐ Première action lancée, exécutée, validée.

**Avant l'audit de certification** — ☐ Zéro lacune bloquante ☐ NC ouvertes toutes avec CAPA ☐ Aucune action en retard ☐ Au moins un audit interne clôturé (constats vérifiés) ☐ Une revue de direction tenue ☐ Documents en vigueur publiés, anciennes versions dépréciées ☐ Compte **Auditeur externe** prêt ☐ CSV d'archive : actions, NC/CAPA, journal complet, matrice.

**Après l'audit** — ☐ Compte externe suspendu ☐ Constats externes saisis en NC ☐ CAPA lancées ☐ Revue de direction planifiée.

---

## Annexe A — Qui peut quoi (droits réels de la base)

| Droit | Admin | RQ | Site | Dépt | PO | Opérat. | Aud. int. | Aud. ext. | Consult. | Lecteur |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Lire actions / NC / matrice / WF / documents publiés | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Voir **toutes** les actions et preuves | ● | ● | ● | ● | | | ● | ● | ● | |
| Lancer / assigner / réassigner une action | ● | ● | ● | ● | | | | | ● | |
| Exécuter et soumettre une action | ● | | ● | ● | ● | ● | | | | |
| Valider / rejeter une action, créer une NC | ● | ● | ● | ● | | | | | | |
| Plan CAPA, vérification d'efficacité | ● | ● | | | | | | | | |
| Déposer une preuve | ● | ● | ● | ● | ● | ● | ● | | ● | |
| Exporter une preuve / la matrice | ● | ● | ● | ● | | | ● | ● | ● | |
| Journal d'audit, rapports CSV, paquet d'audit | ● | ● | | | | | ● | ● | ● | |
| Créer / éditer un brouillon de workflow ou de document ; modifier la matrice | ● | ● | ● | ● | | | | | ● | |
| Approuver workflows, documents, non-applicabilités | ● | ● | | | | | | | | |
| Gérer les audits internes | ● | ● | | | | | ● | | | |
| Répondre aux constats | | ● | ● | ● | ● | ● | | | | |
| Lire les audits internes | ● | ● | ● | ● | ● | ● | ● | ● | | |
| Gérer les revues de direction | ● | ● | | | | | | | | |
| Lire les revues de direction | ● | ● | | | | | ● | ● | | |
| Gérer les utilisateurs | ● | | | | | | | | | |

*Particularité :* le droit « Voir toutes les actions » vaut **lecture** : il n'autorise ni dépôt de preuve sur l'action d'un autre, ni validation.

## Annexe B — Glossaire

**Action** : une tâche issue d'un workflow, assignée à une personne. **Workflow** : définition d'un processus (actions → étapes). **Tenant** : une entreprise cliente (données cloisonnées). **NC** : non-conformité. **CAPA** : action corrective et préventive. **Preuve** : fichier ou mesure rattachée à une étape, scellée par une empreinte SHA-256. **Séparation des tâches** : on ne valide pas son propre travail. **Espace** (matrice) : 1 Consultant, 2 Personnel interne, 3 Auditeur externe. **Journal d'audit** : suite non modifiable des événements du système.
