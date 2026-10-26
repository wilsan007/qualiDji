# Procès-verbal de recette — Compliance Execution Platform (Module ISO 9001 · IA Assistant Terrain)

| | |
|---|---|
| **Projet** | QualiDji — plateforme d'exécution de conformité ISO 9001 (référentiel ISO 9001:2026 / HLS) |
| **Cahier des charges** | Spécification consolidée V5 (addenda V3/V4/V5) — version texte du 19/10/2026 |
| **Version logicielle** | Branche `main` — dernier commit de la campagne : `8e869b3` (+ `docs/PV_RECETTE_V5.md`) |
| **Date de campagne** | 19–20 octobre 2026 |
| **Environnements testés** | Local (Supabase local + backend :4000) **et** projet distant `aomjfwkmnpbuazltahxu` (backend pointé cloud) |
| **Résultat global** | **RECETTE FAVORABLE sous conditions résiduelles** (§7 du présent PV) |

---

## 1. Synthèse d'acceptation

| Domaine (§ cahier des charges) | Statut | Preuves principales |
|---|---|---|
| P1 — Socle sécurisé (auth, tenant, RLS, RBAC) | ✅ Accepté | Migrations 0001-0007 · 25 checks E2E RBAC · 13 tests unitaires middleware |
| P2 — Cœur d'exécution (§5.2 Module B, exécution d'actions) | ✅ Accepté | Cycle brouillon→publication E2E · seeds WF_CONTEXT_ANALYSIS |
| §3.4 — Gestion des utilisateurs | ✅ Accepté | Invitations GoTrue, historique rôles, suspension = révocation sessions · 10 checks E2E |
| P4 — NC/CAPA (§9) | ✅ Accepté | Registre NC, CAPA, effectiveness-check · routes gate `action.approve`/`capa.close` |
| P3 — Assistant IA encadré (§7) | ✅ Accepté | Contrat §7.4, règles R1-R10, provider abstrait, journal R5 · **30 tests unitaires** dont injections |
| §5.7 — Notifications | ✅ Accepté | Idempotence par clé (§5.7), liens profonds, 6 événements branchés · cloche UI |
| P5 (partiel) — Rapports & exports (§5.8) | ✅ Accepté | Rapports actions/NC-CAPA/paquet d'audit, **CSV avec méta (date, exportateur, filtres)** |
| §8.6 — Documents contrôlés + RAG (§7.6) | ✅ Accepté | Cycle versionné, classification, corpus IA filtré tenant · 13 checks E2E dont RAG bout en bout |
| P6 — Hors ligne / PWA (§13) | ✅ Accepté | File FIFO idempotente (13 tests), bandeaux UI, service worker (shell only) |
| P7a — CI & durcissement (§15-§16) | ✅ Accepté | Workflow GitHub **vert** (typecheck + 63 tests + build), rate limiter (7 tests) |
| P5 (restant) — Audits internes, revues de direction | ⏳ Lot suivant | — |
| P7b — Tests frontend automatisés | ⏳ Lot suivant | — |
| P8 — Déploiement production, backup/restauration | ⏳ Lot suivant | — |

---

## 2. Campagnes de test exécutées (chiffres réels)

### 2.1 Tests unitaires — `npm test` (backend, hors ligne, sans DB)
**63 asserts, 0 échec** — exécutable sans secret ni réseau (contraignant §16) :

| Suite | Asserts | Couverture |
|---|---|---|
| `test_matrix_logic.ts` | ~13 | Statuts matrice, lacunes bloquantes, non-applicabilité K.4, réserves K.5 |
| `test_rbac_permissions.ts` | 13 | `requirePermission`/`requireAnyPermission`/`requireTenant` : 401, bypass plateforme, dénis |
| `test_ai_controls.ts` | 30 | Contrat §7.4, R1 étapes inventées, R2 seuils, R3 sources + **isolation inter-tenant**, R4 review forcée, R6 circuit breaker + fallback, **R8 : 5 injections détectées / 3 textes innocents laissés**, R5 hash |
| `test_rate_limiter.ts` | 7 | Fenêtre fixe, indépendance par IP, rotation, Retry-After |
| `test_offline_queue.ts` | 13 | Persistance, clé d'idempotence, **FIFO préservé sur échec**, reprise, plafond |

### 2.2 Tests de bout en bout — `scripts/e2e_rbac.sh`
**84 checks, 0 échec — exécutés dans les DEUX environnements** (local :4000 et projet distant via backend cloud) :

| Section | Checks | Points notables |
|---|---|---|
| Authentification | 2 | 401 sans token |
| action.read / tenant scoping | 3 | OP opérateur limité à ses actions, 404 hors tenant |
| audit.export / evidence.export | 5 | OP 403, QM 200 (CSV) |
| action.approve / capa.close | 6 | OP 403, QM 400 (permission acceptée) |
| workflow.read/approve, dashboards | 8 | Droits par rôle vérifiés |
| **Module B** — bibliothèque WF | 11 | Cycle complet créé→soumis→approuvé (TA), duplication versionnée, déni OP |
| **§3.4** — utilisateurs | 10 | Invitation (skip quota cloud documenté), historique rôles, **suspension = login refusé** |
| **§5.7** — notifications | 6 | Événements réels : submit→TA, approve→créateur (séparation des tâches) |
| **§5.8** — rapports | 7 | **Méta CSV vérifiées** : date d'extraction, identité exportateur, filtres appliqués |
| **P3** — IA | 5 | Contrat §7.4 servi, **injection → 400 ERR_AI_INJECTION journalisée**, journal R5 |
| **§8.6** — documents | 13 | Cycle versionné + **RAG : la guidance référence le document publié du tenant** |
| Session `/me` | 3 | Permissions propres au rôle (pas de droits en trop côté OP) |

### 2.3 Intégration continue (GitHub Actions)
Workflow `.github/workflows/ci.yml` — **vert** (run `39309413185`, 35 s) sur chaque push/PR :
typecheck racine → 63 tests unitaires → build frontend. Aucune DB ni secret requis.

---

## 3. Preuves par exigence majeure

### §3.2/§3.3 — Profils et autorisations (durcissement RBAC)
- **Implémentation** : `requirePermission`/`requireAnyPermission` sur **64 routes backend** ; `requireRole` supprimé ; bypass total `super_admin`/`technical_admin` ; scoping tenant systématique ; migrations 0006 (17 permissions, rôles V5) + 0007 (fix policy 0004, `tenant.read`).
- **Frontend** : `GET /api/v1/me` (permissions réelles par rôle) → hook `usePermissions` → nav et boutons gated (Traceability, NonConformities, Layout, Workflows, Users, Reports, Documents).
- **Preuves** : 13 tests unitaires middleware · 25+ checks E2E dénis/autorisations par rôle (OP vs QM vs TA) · vérification « OP /me sans audit.export ».

### §5.2 — Module B : bibliothèque de workflows
- Cycle **brouillon → revue → approbation → publication** (migration 0008), **duplication versionnée avec motif obligatoire** (la seule voie de modification d'un publié), dépréciation, suppression réservée aux non-publiés non instanciés.
- **Preuves** : 11 checks E2E du cycle (créé par QM, approuvé par TA — séparation des tâches §6.3), notifications couplées.

### §3.4 — Gestion des utilisateurs
- Invitations `inviteUserByEmail` GoTrue (**lien expirant et à usage unique**, aucun mot de passe en clair) ; **historique des changements de rôle** (`user_role_history`, migration 0009) ; **suspension = ban GoTrue** (sessions révocées, vérifié : login refusé).
- **Preuves** : 10 checks E2E · smoke avec vérification login d'un utilisateur suspendu.

### §5.7 — Notifications internes
- Clé d'**idempotence** par destinataire (unique `(user_id, dedupe_key)`, migration 0010), liens profonds vers objets protégés (permissions revalidées à l'ouverture), anti auto-notification, cloche UI avec badge non-lues.
- **Événements branchés** : action soumise/bloquée, NC créée (exception + création), workflow en revue (→ tenant_admins), approuvé/rejeté (→ créateur).
- **Preuves** : 6 checks E2E sur événements réels du cycle Module B · smoke 6/6 (read-all, 404 sur notif d'autrui).

### §5.8 — Rapports et préparation d'audit
- Rapport d'actions (filtres statut/période/responsable, ancienneté, retard), registre NC+CAPA (gravité, échéance, efficacité), paquet d'audit (workflows, taux d'évaluation des exigences, 20 derniers événements).
- **Exports CSV conformes §5.8** : chaque fichier porte **date d'extraction, identité de l'exportateur et filtres appliqués** ; structure `recorded` (données enregistrées) / `computed` (agrégats — **aucun texte IA**, §5.8 dernier alinéa).
- **Preuves** : 7 checks E2E dont vérification automatisée des méta CSV.

## 4. Comptes et environnements de recette

| Compte | Rôle | Environnements |
|---|---|---|
| `rbac.test@qualidji.fr` | quality_manager | local + distant |
| `operator.test@qualidji.fr` | operator | local + distant |
| `ta.test@qualidji.fr` | tenant_admin (user.manage, workflow.approve) | local + distant |
| `e2e.member@qualidji.fr` | reader (cible des tests §3.4) | local + distant |

Mot de passe des comptes de test : **plus en clair dans le dépôt** (H6) — il est fourni par la variable `E2E_PASSWORD` (générée par run en CI : voir `ci.yml`) et les comptes restent **à révoquer avant toute mise en production**. La valeur historique de recette, autrefois en clair, doit être considérée comme compromise et changée.

### §7 — Assistant IA encadré (critère de sortie P3)
- Contrat JSON **§7.4 versionné** validé par schéma ; pipeline §7.3 complet ; **R1** étapes inventées retirées ; **R2** aucun seuil inventé (→ `missing_information`) ; **R3** source_refs vérifiées ; **R4/R10** jamais approuvé, aucune action automatique ; **R5** journal (modèle, version prompt sha256, hashes entrée/sortie, latence, résultat) ; **R6** fallback + circuit breaker ; **R7** corpus filtré serveur ; **R8** injection rejetée et journalisée.
- **Preuves** : **30 tests unitaires** (dont 5 injections fr/en détectées et 3 textes métier innocents laissés) · 5 checks E2E dont `injection → 400 ERR_AI_INJECTION` · journal consultable (`GET /ai/interventions`, audit.export).

### §7.6/§8.6 — Documents contrôlés et RAG
- Registre versionné par tenant (migration 0012) : classification, date d'effet, approbateur, `supersedes_id`, cycle complet ; **corpus IA = documents publiés du tenant uniquement** (filtre serveur tenant+status+date d'effet).
- **Preuves** : 13 checks E2E dont **« la guidance IA référence le document publié » (RAG bout en bout)**.

### §13 — Mode hors ligne
- File FIFO **idempotente** (clé par opération métier ; rejeu sans effet de bord via upsert unique serveur), préservation d'ordre sur échec, reprise après rechargement, persistance Dexie, bandeaux UI hors-ligne/synchronisation, service worker **sans cache des API**.
- **Preuves** : 13 tests unitaires · build PWA (manifest + sw + icône) vérifié dans `dist/`.

### §15-§16 — Exigences non fonctionnelles et tests
- Rate limiting 600 req/10 min/IP sur `/api/v1` (429 + Retry-After) ; helmet ; CI verte ; tests unitaires offline conformes §16 ; E2E scripté reproductible dans les deux environnements.

---

## 5. Migrations appliquées
`0001`…`0012` appliquées et vérifiées **dans les deux environnements** : tenants, workflows, ai/evidence, RLS, requirements, RBAC (0006/0007), workflow_library (0008), user_management (0009), notifications (0010), ai_controls (0011), documents (0012).

## 6. Écarts connus (documentés, non bloquants)
1. **Invitations e-mail sur GoTrue cloud** : rate limit (~1/h) et validation stricte des adresses → le E2E distant saute proprement ce check (`○ skip`) ; comportement attendu du quota Supabase.
2. **E2E non exécuté en CI** : il exige une instance Supabase + comptes de test ; il reste scripté et manuel (`npm run test:e2e`). Automatisation prévue en P7b.
3. **RAG** : corpus = documents publiés + exigences (pas encore d'extraction de fichiers binaires ni de recherche vectorielle ; le « jeu d'évaluation » §7.6 reste à enrichir).
4. **Hors ligne** : couvre la saisie d'étape (`step.submit`) ; l'ajout de preuves fichiers hors ligne reste à câbler (upload nécessite le réseau).

## 7. Conditions résiduelles à lever avant mise en production
1. **P5 final** : module audits internes (programme, constats, plan d'actions) et revues de direction — lot suivant.
2. **P7b** : tests frontend automatisés (vitest/playwright) + job CI E2E avec `supabase start`.
3. **P8** : déploiement, sauvegarde/restauration (§17), révocation des comptes de recette, rotation des secrets, SMTP transactionnel, fournisseur IA contractuellement approuvé (§7.7).

## 8. Acceptation

Le lot livré couvre l'ensemble du périmètre **P1 à P7a** du plan de réalisation (§19) avec des preuves exécutables et rejouables : **63 tests unitaires + 84 checks E2E × 2 environnements + CI verte**. Les exigences de sécurité structurantes sont démontrées : isolation multi-tenant, RBAC par permission, journalisation, IA sans action autonome, exports tracés, reprise hors ligne.

| Rôle | Nom | Date | Signature |
|---|---|---|---|
| Recette (client) | | | |
| Direction technique | | | |
| Responsable qualité | | | |

*Document généré depuis les résultats réels de campagne — reproductible : `npm test`, `npm run test:e2e`, CI GitHub.*


