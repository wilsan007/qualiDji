# Cahier d'utilisation n° 2 — L'auditeur externe

**Pour qui :** l'auditeur d'un organisme de certification, d'un client ou de toute tierce partie invité à vérifier le système de management de la qualité d'une entreprise sur QualiDji.
**Version décrite :** code de la branche `feat/onboarding-auditor-capa-gaps` (migration 0021). **Rédigé le 2 novembre 2026** à partir du code et d'un parcours réel de l'application avec un compte « Auditeur externe ».
**Les trois cahiers :** [Entreprise](01-cahier-entreprise.md) · [Auditeur externe](02-cahier-auditeur-externe.md) · [Organisme accompagnateur](03-cahier-organisme-accompagnateur.md).

---

## 0. L'essentiel en dix lignes

* Vous recevez **un compte par entreprise auditée** ; vous ne voyez **que** les données de cette entreprise.
* Vous êtes en **lecture seule, partout** : aucun bouton ne crée, ne modifie, ne valide, ne supprime. Même par l'API, le serveur vous refuse toute écriture.
* Vous voyez : le tableau de bord et **toutes les actions** de l'entreprise avec leurs **preuves** (vérifiables par empreinte SHA-256), les non-conformités et CAPA, la matrice des exigences, la bibliothèque de workflows, les documents publiés, les audits internes et leurs constats, les revues de direction, les rapports et **le journal d'audit complet**.
* Vous pouvez **exporter** : CSV actions, CSV NC/CAPA, **CSV du journal d'audit complet**, CSV de la matrice, paquet d'audit.
* **Vos exports sont journalisés** (« Export (CSV / paquet) », avec votre e-mail) ; la lecture du journal par l'API l'est aussi (« Journal d'audit consulté ») : l'entreprise peut le vérifier.
* QualiDji **ne remplace pas votre rapport** : vos constats ne s'y saisissent pas (§8).

---

## 1. Obtenir et ouvrir son accès

1. L'entreprise (son administrateur) vous invite avec le rôle **Auditeur externe** depuis l'écran **Utilisateurs**.
2. Vous recevez l'e-mail « Invitation à rejoindre QualiDji ». **Le lien ne sert qu'une fois et expire.**
3. La page **Choisissez votre mot de passe** s'ouvre : **Nouveau mot de passe** (12 caractères minimum), **Confirmer le mot de passe**, **Enregistrer et accéder à mon espace** ([capture](img/03-definir-mot-de-passe.png)).
4. Vous arrivez sur le **Tableau de bord** ([capture](img/40-auditeur-externe-tableau-de-bord.png)). L'en-tête indique « *Auditeur externe · Auditeur externe* » : c'est l'**Espace 3 — Auditeur externe**.
5. Ensuite : [page de connexion](img/01-connexion.png). Mot de passe oublié : **Mot de passe oublié ?** → lien par e-mail → même page.
6. Si le lien est « invalide ou expiré » : demandez une nouvelle invitation à l'administrateur de l'entreprise.

**À la fin de votre mission,** l'entreprise suspend votre compte (vos sessions sont coupées) ; **les traces de vos exports restent**.

---

## 2. Vos écrans, et ce que chacun vous donne

Votre menu : **Tableau de bord · Mes actions · Non-conformités · Prêt audit · Matrice ISO · Bibliothèque WF · Rapports · Documents · Audits internes · Revues direction.** *(L'écran Utilisateurs vous est fermé : un lien direct vous renvoie au tableau de bord.)*

| Écran | Ce que vous y vérifiez | Boutons que vous avez |
|---|---|---|
| **Tableau de bord** | Compteurs et liste des actions de **toute** l'entreprise (les 50 plus récentes) | **Ouvrir** |
| **Mes actions** ([capture](img/21-mes-actions.png)) | Toutes les actions, filtrables : Toutes, Assignées, En cours, Soumises, Bloquées, Approuvées | filtres, **Ouvrir**, **Afficher les actions suivantes** |
| **Détail d'une action** ([capture](img/41-auditeur-externe-preuves.png)) | Étapes, **réponses saisies**, contraintes, validation, **preuves** | **Voir les preuves**, **Vérifier**, **Télécharger** |
| **Non-conformités** | Registre des écarts, plan CAPA, vérification d'efficacité, clôture | déplier une NC |
| **Prêt audit** ([capture](img/42-auditeur-externe-pret-audit.png)) | **Journal d'audit** (qui a fait quoi, quand) | **Journal complet (CSV)**, **Actualiser** |
| **Matrice ISO** | Applicabilité, preuves attendues, tests, non-applicabilités justifiées et approuvées | **Exporter (CSV)**, **Actualiser** |
| **Bibliothèque WF** | Processus publiés : actions, étapes, règles, garde-fous, approbateurs | déplier une ligne |
| **Rapports** ([capture](img/43-auditeur-externe-rapports.png)) | Actions par statut et retards, registre NC/CAPA, paquet d'audit | **CSV actions**, **CSV NC/CAPA**, **CSV journal d'audit**, **Paquet d'audit** |
| **Documents** | Registre des documents **publiés** et leur historique de versions | déplier une ligne |
| **Audits internes** ([capture](img/44-auditeur-externe-audits.png)) | Programme, périmètre, critères, constats, réponses, vérifications, clôture | — |
| **Revues direction** ([capture](img/45-auditeur-externe-revues.png)) | Entrées consolidées, décisions, actions, date de tenue | déplier une revue |

**Vous ne voyez pas :** les brouillons et documents retirés (réservés aux approbateurs et auteurs), les documents « Secret », le contenu des documents « Confidentiel » dont vous n'êtes pas destinataire (vous voyez « restreint »), la liste des utilisateurs et leurs rôles.

**Aide en ligne :** le bandeau **Que faire ici ?** de chaque écran vous rappelle ce que l'écran contient (« Accès d'audit en lecture seule … ») ; **Comment faire… ?** répond à partir de la notice.

---

## 3. Programme de vérification, clause par clause

Pour chaque thème : *ce que vous cherchez*, *où le trouver*, *comment le vérifier*, *signaux d'alerte*.

### 3.1 Contexte, périmètre, applicabilité (clause 4) — **Matrice ISO**

* **Ce que vous cherchez :** une analyse des 54 exigences, un responsable par exigence, une preuve attendue, une méthode de vérification, des tests positif et négatif exécutés, des non-applicabilités **justifiées et approuvées par une autre personne**.
* **Où :** **Matrice ISO** ([capture](img/18-matrice.png)). Quatre cartes : **Exigences applicables**, **Testées conformes**, **Lacunes bloquantes**, **Non applicables justifiées** ; tableaux **Couverture par clause** et **par espace** ; filtres **Clause / Espace / Statut de couverture**.
* **Comment :** cliquez une ligne : le panneau montre l'état calculé par le serveur, les motifs de blocage, **Dernier motif**, **Dernière mise à jour**, les **Workflows et modules liés**, les tests (**Positif / Négatif**), l'applicabilité et — pour une non-applicabilité — la **Justification motivée** et « *Approuvée par … — personne distincte du demandeur* ».
* **Signaux d'alerte :** « Lacune bloquante » ; « à renseigner » à la place du responsable ; non-applicabilité « *en attente d'approbation* » ; justification générique ; beaucoup de lignes « Non analysé ».
* **Preuve du changement :** chaque modification exige un motif et laisse un événement dans le journal (« Ligne de la matrice modifiée », « Test d'acceptation enregistré », « Non-applicabilité approuvée »).
* ⚠ **Réserve de l'éditeur :** l'écran avertit que l'état de préparation « *ne vaut ni audit indépendant ni certification* » et que la couverture logicielle ne garantit pas la conformité de l'organisation. Le catalogue des exigences est à confirmer sur un exemplaire autorisé de la norme.

### 3.2 Informations documentées (clause 7.5) — **Documents**

* **Ce que vous cherchez :** une version en vigueur identifiée, approuvée par une personne distincte de l'auteur, un historique de versions avec motifs, une classification, le retrait des versions périmées.
* **Où :** **Documents** : colonnes **Clé, Titre, Type, Classif., Version, Statut**. Cliquez la clé : résumé (« extrait »), motif de la version, **Historique des versions** (vN · statut · date — motif).
* **Comment :** un seul document **Publié** par clé ; les anciennes versions sont **Dépréciées** ; qui a approuvé et quand : événements « Document approuvé et publié » du **journal** (auteur de l'événement ≠ créateur).
* ⚠ **Limite :** le registre porte le **résumé** du document, pas le fichier. Demandez le fichier maître à l'entreprise et rapprochez-le de l'extrait.

### 3.3 Processus et maîtrise opérationnelle (clause 8) — **Bibliothèque WF**, **Mes actions**

* **Ce que vous cherchez :** des processus définis (actions, étapes, rôles), approuvés avant usage, exécutés par les bonnes personnes, avec preuves.
* **Où :** **Bibliothèque WF** : code, nom, clause, version, fréquence, statut. Déplier une ligne : chaque **action** (rôle exécutant) et chaque **étape** (type, règle, garde-fous, approbateur, séparation des tâches). Le badge **global** signale le workflow fourni par la plateforme.
* **Comment échantillonner l'exécution :** **Mes actions** → filtre **Approuvées** (ou **Bloquées**, **Soumises**) → **Ouvrir** une action. Vous voyez : titre, workflow, clause, statut, **Assignée à** (nom), date de création et de soumission, chaque étape avec la **réponse saisie**, le badge **Saisie enregistrée**, le **commentaire de validation** (« *Action approuvée le … — commentaire* »). Les actions **en retard** et leur **ancienneté** sont dans **Rapports**.
* **Signaux d'alerte :** workflow utilisé alors qu'il n'est pas **Publié** (impossible par construction) ; étape obligatoire sans preuve alors que la matrice en attend une ; réponses minimalistes (contrainte « au moins 50 caractères » à peine atteinte) ; action approuvée le jour même de sa création.

### 3.4 Preuves et intégrité — dans chaque action

1. Dans l'action : sous l'étape, **Voir les preuves** ([capture](img/41-auditeur-externe-preuves.png)).
2. La liste donne : nom du fichier, taille, début de l'**empreinte SHA-256**.
3. **Vérifier** : le serveur **recalcule** l'empreinte depuis le stockage et la compare à celle enregistrée au dépôt. Résultat : **« intègre »** (vert) ou **« ALTÉRÉ »** (rouge). Une pièce « ALTÉRÉ » est un fait grave : notez-le et demandez l'explication.
4. **Télécharger** ouvre un lien **signé et temporaire** (quelques minutes) vers la pièce.
5. Le dépôt et le téléchargement de chaque pièce sont des événements du journal (« Preuve téléversée », « Preuve téléchargée »).

### 3.5 Surveillance, mesure, analyse (clause 9.1) — **Rapports**

* **Où :** **Rapports** ([capture](img/43-auditeur-externe-rapports.png)) : filtres **Statut**, **Créé après**, **Créé avant**.
* **Rapport d'actions :** total, répartition par statut, **en retard** ; tableau (Workflow, Titre, Responsable, Statut, Échéance, Ancienneté ; 50 lignes à l'écran, tout dans le CSV).
* **Registre NC & CAPA :** NC au total, ouvertes, par gravité, **CAPA en retard**, **Efficacité non conforme**.
* **Paquet d'audit** : workflows publiés (x/y), exigences évaluées (x/y), **taux d'évaluation**, nombres d'actions, NC, CAPA, derniers événements.
* **Nature des chiffres :** les données sont **enregistrées** ou **calculées côté serveur** ; **aucun texte n'est généré par une IA** dans les rapports. Chaque CSV commence par trois lignes `#` : **date d'extraction, exportateur, filtres appliqués**.

### 3.6 Audit interne (clause 9.2) — **Audits internes**

* **Ce que vous cherchez :** un programme, des critères et un périmètre, des auditeurs **indépendants**, des constats factuels, des réponses, une vérification d'efficacité, une clôture motivée.
* **Où :** **Audits internes** ([capture](img/44-auditeur-externe-audits.png)) — pour chaque audit : titre, périmètre, **critères**, **Auditeur**, dates de démarrage et de clôture, statut (**Planifié / En cours / Clôturé**), **Synthèse de clôture**. Pour chaque constat : titre, **faits observés**, classification (minor / major / observation), **Responsable de processus**, **réponse** (« *Réponse process : …* » et action corrective), **réponse de … le …**, **vérifié par … le …**, statut (**Ouvert, Répondu, Efficacité vérifiée, Réouvert**).
* **Indépendance prouvée par le système :** on ne peut pas être auditeur de l'audit qu'on a planifié ; **la vérification est faite par une personne distincte du répondant et du responsable de processus**. Les tentatives refusées apparaissent dans le journal (« *Auto-audit refusé (séparation des tâches)* », « *Vérification refusée (séparation des tâches)* »).
* **Les faits observés d'un constat sont immuables** après création ; la réponse est stockée à part.
* **Signaux d'alerte :** audit sans constat ni synthèse sur une activité à risque ; constats « majeur » clôturés très vite ; même nom pour répondant et vérificateur (impossible) ; audit « En cours » depuis très longtemps.
* ⚠ **Limites :** pas de programme annuel d'audits ni de check-list par clause ; le lien constat ↔ clause est en texte libre.

### 3.7 Revue de direction (clause 9.3) — **Revues direction**

* **Où :** **Revues direction** ([capture](img/45-auditeur-externe-revues.png)) : titre, statut **Brouillon / Tenue**, **date de tenue**. Dépliez : **Entrées consolidées** (actions par statut et retards ; NC et CAPA par gravité, en retard, efficacité non conforme ; audits internes total/clos ; **date et auteur de la consolidation**, « *aucun texte IA* »), **Décisions**, **Actions issues de la revue**.
* **Garanties :** une revue ne peut être « tenue » qu'avec **des entrées consolidées ET au moins une décision** ; une revue tenue est **figée**.
* ⚠ **À demander à l'entreprise** (hors plateforme) : les entrées 9.3 qui ne sont pas des données de QualiDji — satisfaction des clients, atteinte des objectifs qualité, performance des fournisseurs, risques et opportunités, changements, ressources — et le compte rendu signé. Les responsables et échéances des actions de revue sont en texte libre.

### 3.8 Non-conformité et amélioration (clause 10.2) — **Non-conformités**

* **Où :** **Non-conformités** ([capture](img/23-non-conformites.png)). Ligne : titre, **Réf.**, date de déclaration, **gravité** (Critique / Majeure / Mineure), **statut** (Ouverte / En cours / Clôturée). Dépliez : identifiant, **plan CAPA** (cause racine, action corrective, responsable, échéance, statut du plan), **vérification d'efficacité** (date, résultat, commentaire), date de **clôture** de la NC.
* **Cycle vérifié par le serveur :** Ouverte → En cours (dès qu'un plan CAPA existe) → **Clôturée seulement après une vérification d'efficacité positive** ; une vérification **négative** laisse la NC **En cours** et la CAPA « **Rouvert** ».
* **Origine :** les NC issues d'une action sont titrées « *Exception sur action …* » et liées à l'action bloquée.
* **Signaux d'alerte :** NC ouvertes sans CAPA ; CAPA sans échéance ou en retard ; efficacité jamais vérifiée ; gravité « critique » clôturée sans commentaire d'efficacité.
* ⚠ **Limite :** le logiciel n'exige pas que la vérification d'efficacité soit faite par une autre personne que l'auteur du plan : **vérifiez-le dans le journal** (qui a créé le plan, qui a vérifié).

### 3.9 Traçabilité générale — **Prêt audit** et **journal complet**

* **Prêt audit** ([capture](img/42-auditeur-externe-pret-audit.png)) : compteurs (**Événements d'audit, Preuves déposées, Étapes saisies**) et liste des **100 derniers événements** (50 affichés) : **libellé en clair, auteur (e-mail), objet, date/heure**.
* **Journal complet (CSV)** : **tous** les événements du tenant, dans l'ordre chronologique, avec colonnes `date, acteur, action, entite, id_entite, details` ; en tête : date d'extraction, exportateur, filtres. **Les événements sont non modifiables.**
* **Événements à connaître :** `action.create / assign / start / submit / approve / reject / exception`, `action.approve_blocked`, `step.submit`, `evidence.upload / record / download / delete`, `nonconformity.create`, `capa.create`, `capa.effectiveness_check`, `document.*`, `workflow.*`, `audit.*`, `management_review.*`, `matrix.*`, `user.invite / update / deactivate / activate`, `report.export`, `audit_log.view`.
* **Contrôles utiles dans le journal :** (1) l'auteur de `document.approve` ≠ celui de `document.create` ; (2) l'auteur de `action.approve` ≠ celui de `action.submit` ; (3) les `*_blocked` montrent que les garde-fous ont réellement joué ; (4) les `user.update` portent le **motif** de changement de rôle ; (5) les `evidence.delete` sont réservés aux responsables de la qualité.

---

## 4. Déroulé type d'une vérification (demi-journée)

| Étape | Durée | Écran | Action |
|---|---|---|---|
| 1 | 10 min | **Prêt audit** | **Journal complet (CSV)** : archivez-le ; lisez les compteurs |
| 2 | 20 min | **Matrice ISO** | **Exporter (CSV)** ; lacunes bloquantes ; non-applicabilités approuvées |
| 3 | 30 min | **Documents** | Échantillon de 5 documents : version, historique, motifs, approbateur (journal) |
| 4 | 20 min | **Bibliothèque WF** | 2 workflows : étapes, règles, approbateurs |
| 5 | 60 min | **Mes actions** | 5 actions **Approuvées** + 1 **Bloquée** : réponses, validation, **Vérifier** chaque preuve |
| 6 | 30 min | **Non-conformités** | 3 NC : CAPA, efficacité, clôture ; **CSV NC/CAPA** |
| 7 | 30 min | **Audits internes** | 1 audit clos : constats, réponses, vérification, synthèse |
| 8 | 20 min | **Revues direction** | La dernière revue tenue : entrées, décisions |
| 9 | 20 min | **Rapports** | **Paquet d'audit** ; retards ; **CSV actions** |
| 10 | 20 min | **Prêt audit** | Rapprochement : événements ↔ constats ; événements `*_blocked` |

---

## 5. Ce que vous pouvez conclure — et ce que vous ne pouvez pas

**Vous pouvez** constater : l'existence, la date, l'auteur et l'enchaînement de chaque enregistrement ; le respect de la séparation des tâches (refus journalisés) ; l'intégrité des pièces (empreinte) ; la complétude du registre des exigences et des tests ; le respect du cycle documentaire ; la tenue des audits internes et des revues.

**Vous ne pouvez pas** conclure, **sur la seule foi de l'outil** : que les processus décrits sont **pertinents** ou **appliqués sur le terrain** ; que le contenu d'un document est conforme ; que les réponses saisies sont vraies. QualiDji prouve **qui a enregistré quoi et quand**, pas que la réalité correspond. C'est votre rôle de rapprocher le dossier du terrain.

---

## 6. Messages que vous pouvez rencontrer

| Message | Signification |
|---|---|
| *missing permission: …* | Vous avez tenté une écriture (ou ouvert un écran interdit) : votre compte est en lecture seule |
| *Aucune preuve enregistrée pour cette étape* | Aucune pièce n'est jointe à cette étape |
| « *ALTÉRÉ* » | L'empreinte recalculée ≠ l'empreinte enregistrée : **anomalie d'intégrité** |
| *Ce lien est invalide ou a expiré* | Lien d'invitation déjà utilisé : demandez une nouvelle invitation |
| Écran vide / « Aucun audit planifié » / « Aucune revue de direction » | Rien n'a été enregistré : **c'est une information d'audit** |

---

## 7. Check-list de l'auditeur

☐ Accès ouvert, mot de passe choisi ☐ Journal complet exporté (date/heure notées) ☐ Matrice : lacunes, non-applicabilités approuvées ☐ Documents : versions, historique, approbateurs ☐ Workflows : étapes et approbateurs ☐ Actions : échantillon, preuves **vérifiées** ☐ NC/CAPA : efficacité, clôtures ☐ Audit interne : indépendance, vérification, synthèse ☐ Revue de direction : entrées, décisions, date ☐ Rapports et paquet d'audit exportés ☐ Événements `*_blocked` examinés ☐ Constats propres rédigés **dans votre outil**.

---

## 8. Limites à connaître

* **Vos constats ne se saisissent pas dans QualiDji** : aucun module d'audit externe. L'entreprise les traite ensuite en non-conformités.
* **Pas d'export PDF** : tous les exports sont en CSV (UTF-8 avec en-tête de métadonnées).
* **Pas de recherche** par numéro d'enregistrement : on filtre par statut/date et on ouvre depuis la liste ; les références sont de 8 caractères (début de l'identifiant).
* **Pas de vue des utilisateurs** ni de leurs rôles : les noms et e-mails apparaissent dans le journal et sur les enregistrements.
* **Les fichiers des documents** ne sont pas dans l'outil (résumé seulement).
* **Pas d'authentification à deux facteurs.**
* L'IA est **optionnelle** et ne produit **aucun contenu** dans les rapports ni les revues. Un registre des interventions de l'IA existe côté serveur (modèle, empreintes, résultat) mais **n'a pas d'écran** : demandez-le à l'administrateur de la plateforme si votre mission l'exige.
</content>
