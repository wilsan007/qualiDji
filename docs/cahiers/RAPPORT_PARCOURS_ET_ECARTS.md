# Rapport de parcours et d'écarts — trois profils, écran par écran

**Date :** 2 novembre 2026 · **Branche :** `feat/onboarding-auditor-capa-gaps` (depuis `main` d15bb79) · **Rien n'est commité, poussé ni déployé.**
**Question posée :** une entreprise qui implémente ISO 9001, un auditeur externe qui contrôle, et l'organisme qui accompagne — **tout le parcours existe-t-il, écran par écran, bouton par bouton ?** Sinon, ajouter ; puis rédiger un cahier par profil.

## 1. Méthode

1. Lecture du code de **chaque écran** (12 pages, 7 composants) et d'environ **100 routes** du backend ; extraction de la matrice réelle des droits dans la base (`role_permissions`).
2. **Parcours réel** avec Playwright sur la pile locale, six comptes (administrateur, RQ, responsable de processus, auditeur interne, auditeur externe, consultant) dans une **entreprise vierge** créée par le script d'ouverture : inventaire de chaque écran par rôle (boutons, champs, écrans refusés), puis déroulé complet du cycle de vie (invitation → mot de passe → workflow → document → matrice → action → preuve → IA → exception → NC → CAPA → audit interne → revue de direction → rapports → auditeur externe), avec captures.
3. Chaque manque bloquant a été **corrigé, puis rejoué** dans le navigateur.

## 2. Verdict avant correction

| Profil | Le parcours existait-il ? | Bloquants constatés |
|---|---|---|
| **Entreprise** | **Non**, il s'interrompait dès la première connexion et ne pouvait pas collecter une preuve | pas de page « choisir son mot de passe » ; preuves et guidage IA **inaccessibles** ; 14 types d'étape sur 16 **inexécutables** ; vérification d'efficacité CAPA **sans bouton** ; NC **jamais clôturées** |
| **Auditeur externe** | **Non** | ne voyait **aucune action, aucune preuve**, ni journal, ni rapports, ni audits internes, ni revues |
| **Organisme accompagnateur** | **Non** | **ses brouillons étaient invisibles** (impossible de les éditer ou soumettre) ; pas de création d'entreprise ; éditeur de workflow incapable de définir un choix |

## 3. Ce qui a été corrigé ou ajouté

### 3.1 Bloquants (tous rejoués dans le navigateur)

| # | Constat | Correction | Fichiers principaux |
|---|---|---|---|
| 1 | Invité sans moyen de définir son mot de passe ; pas de « mot de passe oublié » | Page `/set-password`, lien **Mot de passe oublié ?**, lien d'invitation redirigé (`redirectTo`/`APP_URL`), e-mails en français, inscription libre fermée | `pages/SetPassword.tsx`, `Login.tsx`, `routes/users.ts`, `supabase/config.toml`, `supabase/templates/` |
| 2 | Auditeur externe : aucune vue du dossier | Migration **0021** : `action.read_all`, `internal_audit.read`, `management_review.read` + `audit.export` ; garde de lecture distincte de la garde d'écriture ; écrans, menu, guide alignés ; export du **journal complet (CSV)** | `migrations/…0021…sql`, `lib/access.ts`, `routes/{audits,reviews,evidence,reports}.ts`, `navigation.ts`, `App.tsx` |
| 3 | Brouillons des auteurs invisibles (consultant, responsables) | Un auteur voit les publiés **et ses propres brouillons** (workflows et documents) | `routes/{workflows,documents}.ts`, `Workflows.tsx`, `Documents.tsx` |
| 4 | Preuves et guidage IA : panneau ouvert seulement pendant l'envoi de l'étape, refermé aussitôt | Lien **Preuves & guidage IA** / **Voir les preuves** sous chaque étape ; mode lecture seule (liste, **Vérifier**, **Télécharger**) | `WorkflowExecution.tsx`, `EvidenceUploader.tsx` |
| 5 | Guidage IA : toujours 404 (l'écran envoyait l'identifiant de l'exécution, le serveur attend celui de la définition) | Identifiant corrigé | `WorkflowExecution.tsx` |
| 6 | 14 types d'étape sur 16 sans champ de saisie | Nombre, capteur, date, case, confirmation, instruction, signature, photo, fichier, code, QR, position, question | `WorkflowStep.tsx` (+ 6 tests) |
| 7 | Éditeur : impossible de définir les **choix**, le garde-fou de justification, l'approbateur ; rôles en texte libre | Champs ajoutés ; rôles en listes | `Workflows.tsx` |
| 8 | CAPA : pas de vérification d'efficacité ; NC jamais clôturée ; rapport d'efficacité faux (le commentaire écrasait le résultat) | Boutons **Efficacité vérifiée** / **Inefficace — rouvrir** ; cycle NC Ouverte → En cours → Clôturée ; résultat normalisé + commentaire à part | `routes/nonconformities.ts`, `NonConformities.tsx`, migration 0021 |
| 9 | Aucun moyen d'ouvrir une entreprise | Script `tenant:create` (tenant + administrateur + comptes de départ, invitations, garde anti-base distante) | `scripts/create_tenant.ts`, `DEPLOIEMENT.md §14` |
| 10 | **Mes actions** sans liste (page vide) ; compteurs bornés à 50 sans le dire | Liste filtrable + pagination ; note sur le tableau de bord | `ActionsList.tsx`, `Dashboard.tsx` |

### 3.2 Importants

| # | Constat | Correction |
|---|---|---|
| 11 | **Prêt audit** : compteurs faux (« preuves validées » ne se produit jamais), 8 libellés sur 55, auteur absent | 55 libellés, auteur affiché, compteurs réels, **Journal complet (CSV)** |
| 12 | Changement de rôle sans motif alors que la notice l'exige ; auto-modification possible | Motif **obligatoire** (serveur + écran), changement de son propre rôle **refusé** |
| 13 | La page de connexion affichait un **mot de passe de démonstration** | Supprimé |
| 14 | Audits : auditeur, répondant, vérificateur, dates et synthèse de clôture non visibles ; revues : entrées en JSON brut, date de tenue absente | Affichés ; entrées lisibles |
| 15 | Requêtes `/guide` refusées (403) à chaque ouverture d'un écran fermé | Plus de requête pour un écran fermé |
| 16 | NC : la ligne se refermait à chaque enregistrement | Corrigé |
| 17 | « Assignée à » : 8 caractères d'UUID | Nom en clair |
| 18 | Libellés de rôles différents selon l'écran | Uniformisés |
| 19 | Guide et notice : phrases devenues fausses (« pas encore de bouton »…) | Mises à jour (`lib/notice.ts`, `lib/guide.ts`) |

## 4. Ce qui reste — décisions de produit (non corrigé volontairement)

| # | Sujet | Gravité | Pourquoi je n'y ai pas touché | Recommandation |
|---|---|---|---|---|
| R1 | **Contenu métier** : **un seul** workflow fourni (clause 4.1) ; 26 codes sans définition | Haute | Principe fondateur : le RQ définit, personne n'invente de contenu normatif | Le cabinet constitue une bibliothèque de départ validée ; envisager un mécanisme d'import |
| R2 | **Documents sans fichier** (résumé seulement) | Haute | Stockage de fichiers = choix d'architecture et de conservation | Ajouter le dépôt d'un PDF maître scellé par empreinte (comme les preuves) |
| R3 | Un compte = une entreprise (consultant multi-clients) | Moyenne | Modèle de données (un profil par utilisateur) | Adresse `+client` en attendant ; ou table d'appartenances |
| R4 | Aucune **notification** pour un document ou une non-applicabilité à approuver ; les workflows ne notifient que les administrateurs | Moyenne | Règles de destinataires à arbitrer | Notifier RQ + administrateur |
| R5 | Revue de direction : entrées 9.3 incomplètes (satisfaction, objectifs, fournisseurs, risques…) ; actions sans responsable/échéance structurés | Moyenne | Contenu normatif | Entrées guidées + champs responsable/échéance |
| R6 | Audit interne : pas de programme annuel, de check-list, de lien constat ↔ clause | Moyenne | Fonctionnel | À planifier |
| R7 | Pas de module pour les constats de l'**auditeur externe** | Moyenne | Fonctionnel | Saisie guidée en NC |
| R8 | Registre des interventions de l'IA : route sans écran | Basse | — | Écran en lecture pour les auditeurs |
| R9 | Ancienne version d'un workflow reste **Publiée** après approbation de la suivante | Moyenne | Règle de gestion à arbitrer (les documents, eux, se remplacent) | Déprécier automatiquement |
| R10 | CAPA : la vérification d'efficacité par une **autre** personne n'est pas imposée | Moyenne | Peut bloquer une petite équipe | Option par entreprise |
| R11 | Pas d'authentification à deux facteurs ; mot de passe de 12 caractères imposé par l'écran seulement | Moyenne | Configuration Supabase | Activer côté fournisseur |
| R12 | Pas de notifications par e-mail (hors invitation) | Basse | — | Optionnel |
| R13 | Matrice : libellés de champs non reliés aux champs (accessibilité) | Basse | — | Corriger `label`/`htmlFor` |
| R14 | Dépôt de preuve impossible hors ligne | Basse | Documenté | — |

## 5. Vérifications exécutées

* **Tests unitaires backend** : suite complète `npm test` (≈ 260 vérifications) — 0 échec. **Tests frontend** : 115 (dont 10 nouveaux : types d'étape, mot de passe, guide d'un écran fermé) — 0 échec. **Typage** backend et frontend, **eslint** : propres.
* **API (comptes réels)** : auditeur externe → lecture 200 sur actions (40), audits (22), revues (22), journal (50), paquet, CSV ; **403 sur toute écriture** (audits, revues, NC, documents, actions, preuves) ; auditeur interne : 404 sur dépôt de preuve sur l'action d'un autre ; cycle CAPA (ouverte → en cours → inefficace → réouverte → efficace → clôturée) ; motif de rôle (400 / 200) et auto-changement (409).
* **Navigateur** : parcours complet des trois profils (plus de 80 captures prises, 50 retenues dans `img/`) ; invitation → mot de passe → reconnexion ; mot de passe oublié (réponse neutre, e-mail reçu) ; création d'un workflow comportant nombre, choix avec garde-fou, confirmation et approbation, puis son exécution complète.
* **Non rejoué :** `e2e_rbac.sh` en entier et les specs Playwright par rôle (`agent-*`) — ils exigent le mot de passe de recette des comptes `*.test@qualidji.fr`, que je n'ai pas. Les scripts et specs ont été **mis à jour** (nouveaux contrôles CAPA, motif de rôle, accès des auditeurs) et sont prêts à rejouer : `E2E_PASSWORD=… bash apps/backend/scripts/e2e_rbac.sh` et `E2E_PASSWORD=… npx playwright test`.

## 6. Avant de déployer

1. Appliquer la **migration 0021** à la base cible (dry-run d'abord) — **le code suppose les nouvelles permissions**.
2. Dans Supabase : **Site URL**, **Redirect URLs** (`https://<site>/**`), désactiver l'inscription libre, coller les deux modèles d'e-mail ; définir `APP_URL` ; SMTP transactionnel.
3. Rejouer `e2e_rbac.sh` et les specs de rôle avec le mot de passe de recette.
4. Corriger le trou de CI déjà connu : `EXPECT_HARDENED_DB` et `AI_QUOTA_USER_PER_HOUR` ne sont définis que dans l'étape « Démarrage du backend » de `ci.yml`, pas dans « Suite E2E ».
5. Revoir les droits ajoutés à l'auditeur interne (`action.read_all`, `management_review.read`) : cohérents avec son rôle, mais à valider.
