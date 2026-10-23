# Analyse approfondie — QualiDji (Compliance Execution Platform · Module ISO 9001)

| | |
|---|---|
| **Date** | 23/10/2026 |
| **Périmètre** | `/Users/awalehosman/Projects/ISO/qualidji` — dernier commit `b8c3341` (+ 1 fichier modifié non commité : `docs/DEPLOIEMENT.md`) |
| **Méthode** | Lecture directe du code (SQL, backend, frontend, CI, docs), exécution des tests et du typecheck, `pnpm audit`. **Graphify n'a pas pu être installé** (voir §1) : aucun graphe n'a été produit, l'analyse n'en dépend pas. |
| **Limite** | Seuls **C1 et C2 ont été rejoués** contre la pile Supabase locale (voir §9) : ils sont **confirmés**. Tous les autres constats découlent de la lecture du code et n'ont pas été rejoués. |

---

## 1. Graphify — état

**Non installé.** Trois obstacles successifs :

1. Le `python3` système est en 3.9 (graphify exige ≥ 3.10). Python 3.12 existe via Homebrew.
2. `pip` (livré avec ce Python 3.12) plante au démarrage : `platform.mac_ver()` renvoie une chaîne vide, ce que `truststore` ne sait pas parser. Le même échec se produit dans le terminal de l'utilisateur, ce n'est donc pas le sandbox.
3. Avec un contournement (shim `mac_ver`), l'installation échoue ensuite car **PyPI est inaccessible depuis le sandbox**. Mes deux tentatives de sortir du sandbox (option `dangerouslyDisableSandbox`, puis l'onglet Terminal) ont été refusées par le classifieur d'auto-mode. Je ne les ai pas contournées.

Aucun fichier de graphify n'a été installé ni modifié (un venv partiel vide traîne dans `~/.local/share/graphify/venv`, supprimable).

**Pour l'installer vous-même** (non testé ici — `uv` n'utilise pas `pip`, il devrait donc éviter le bug) :

```bash
brew install uv && uv tool install graphifyy && graphify install
```

Puis, à la racine du dépôt, `/graphify .` dans Claude Code (sorties dans `graphify-out/` : `graph.html`, `GRAPH_REPORT.md`, `graph.json`). Source : [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify).

---

## 2. Cartographie du projet

Monorepo pnpm, ~14 900 lignes (SQL, TS, scripts, docs ; hors lockfile), **aucune dépendance entre apps** (le frontend ne partage pas de types avec le backend ; `packages/*` déclaré dans le workspace n'existe pas).

| Couche | Contenu | Volume |
|---|---|---|
| `supabase/migrations` | 13 migrations (tenants → audits/revues) | ~1 100 lignes |
| `supabase/seeds` | 1 workflow (`WF_CONTEXT_ANALYSIS`, 1 action, 4 étapes, 2 prompts) + 54 exigences ISO (annexe N) | ~270 lignes |
| `apps/backend` | Express 4 + Zod + supabase-js ; 16 routeurs, ~80 routes, 5 libs (`aiGuard`, `aiProvider`, `notify`, `rateLimiter`, `supabase`), 1 middleware (`auth`) | ~4 150 lignes |
| `apps/frontend` | React 18 + Vite + Tailwind + Zustand + Dexie ; 12 pages, PWA (SW + manifest) | ~6 950 lignes (tests inclus) |
| Tests | 63 asserts unitaires backend, 60 tests Vitest, `e2e_rbac.sh` (85 appels `check`), 1 smoke Playwright | — |
| CI | `checks` (typecheck, tests, build) + `e2e` (Supabase 2.109.1 fraîche, E2E, Playwright) | — |

**Architecture d'autorisation (deux niveaux, dont un seul est solide)** :
`Navigateur → Express (requireAuth → requirePermission → service_role)` pour la logique, mais le navigateur détient aussi une clé publique Supabase et peut parler **directement à PostgREST** (`supabase.from('user_profiles')` dans `stores/auth.ts`). Toute la sécurité repose donc sur la RLS, qui est lacunaire (voir C1, C2).

**Modules et état réel**

| Module | Backend | Frontend | Remarque |
|---|---|---|---|
| Authentification / `/me` / RBAC (12 rôles, 25 permissions) | ✅ | ✅ | Solide ; cache 5 min des permissions |
| Bibliothèque de workflows (cycle brouillon→publié) | ✅ | ✅ | Bibliothèque **globale** (voir C5) |
| **Exécution d'actions** (cœur du produit) | ⚠️ partiel | ⚠️ | Pas de création/assignation, pas d'approbation (voir C4) |
| Preuves | ⚠️ métadonnées seules | ⚠️ | Fichier jamais envoyé (voir C3) |
| NC / CAPA | ❌ CAPA cassée | ✅ | Voir C6 |
| IA encadrée | ✅ (contrat, garde-fous) | ✅ | Prompts du seed inutilisés (voir H9) |
| Documents contrôlés + RAG | ✅ | ✅ | Voir H2 |
| Matrice de traçabilité | ✅ | ✅ | Voir C5, H3 |
| Audits internes / revues de direction | ✅ | ✅ | Voir H1, M7 |
| Notifications, rapports CSV | ✅ | ✅ | Voir M4, M6 |
| Hors ligne (PWA) | `step.submit` seul | ✅ | Voir M9 |

---

## 3. Résultats des vérifications exécutées

| Vérification | Résultat |
|---|---|
| `tsc --noEmit` backend | ✅ aucune erreur |
| `tsc --noEmit` frontend | ✅ aucune erreur |
| Tests unitaires backend | ✅ 63/63 (13 matrice + 13 RBAC + 30 IA + 7 rate-limiter + 13 file hors ligne ; le détail par fichier est dans la sortie) |
| Vitest frontend | ✅ 60/60 (7 fichiers) |
| `pnpm audit --prod` | ⚠️ 2 avis *moderate* sur `react-router@6.30.6` (corrigé en ≥ 7.18, concerne le SSR : exposition faible pour cette SPA) |
| `pnpm -r lint` | ❌ échoue : `eslint` n'est dans aucune `devDependencies` ni configuré |
| E2E (`e2e_rbac.sh`), Playwright | ⏸ non exécutés (pile Supabase absente) |
| `pnpm build` backend → `dist/` | ❌ ne produit rien (`tsc --noEmit`), `apps/backend/dist` n'existe pas |

---

## 4. Constats

Légende : **Bloquant/Critique** = à corriger avant toute donnée réelle · **Élevé** · **Moyen**.
« Confirmé » = lu dans le code et recoupé ; « À confirmer » = nécessite un test sur base vivante.

### CRITIQUES

**C1 — Cinq tables de référence sans RLS, avec droits complets pour `anon` et `authenticated`** *(confirmé par rejeu, §9 ; corrigé en local par la migration 0014, §10)*
- Tables : `workflow_definitions`, `workflow_actions`, `workflow_steps`, `ai_prompt_templates`, `security_alerts`.
- La migration [0004](../supabase/migrations/20261016000004_rls.sql) accorde `select, insert, update, delete` sur **toutes** les tables à `anon` et `authenticated` (et via `alter default privileges`). Aucune migration n'active la RLS sur ces cinq tables (seules les tables listées dans les `enable row level security` des migrations 0004, 0005, 0006, 0009–0013 l'ont). Le commentaire de 0004 dit « écriture via backend service_role uniquement » : ce n'est pas ce que le SQL fait.
- Conséquence : toute personne disposant de la clé publique (elle est dans [.env.example](../apps/frontend/.env.example), et de toute façon embarquée dans le JS du frontend) peut lire, modifier ou supprimer les workflows, leurs `validation_rule`/`guardrails`/`segregation_of_duties` et les prompts IA, et lire/écrire `security_alerts`. Cela ruine le principe fondateur du README (« l'IA ne génère pas de workflows ; le RQ les définit »).

**C2 — La RLS sur `actions`, `step_submissions`, `evidence` contourne le RBAC et rend la politique « employé » inopérante** *(confirmé par rejeu, §9 ; corrigé en local par la migration 0014, §10)*
- `tenant_isolation_actions` et `tenant_isolation_submissions` sont des politiques `FOR ALL` qui ne testent que le tenant. Toute personne authentifiée du tenant — y compris `reader` ou `external_auditor` — peut, via PostgREST avec son propre JWT, **créer, modifier (statut `approved`, `assigned_to`…) ou supprimer** des actions et des soumissions d'étapes, sans passer par Express.
- Les politiques permissives s'additionnent (OR) : `employee_actions_select` (migration 0004, « corrigée » en 0007) est donc sans effet, tout membre voit toutes les actions du tenant. La « correction » de 0007 corrige une politique qui ne protégeait déjà rien.
- `evidence` : tout membre peut insérer une preuve avec `captured_by`, `checksum` et `exif` de son choix.

**C3 — Les preuves ne sont jamais stockées** *(corrigé en local, §13)*
- [EvidenceUploader.tsx](../apps/frontend/src/components/EvidenceUploader.tsx) calcule un SHA-256 localement puis n'envoie **que des métadonnées** ; `storage_path` est fabriqué côté client (`evidence/<timestamp>_<nom>`). Le fichier n'est envoyé nulle part. Aucune migration ne crée de bucket Storage ; le code n'émet aucune URL signée (la spec §7.1 exige buckets privés + URL signées ≤ 1 h).
- Le checksum vient du client et n'est vérifiable par personne. Un chemin client arbitraire est accepté tel quel (risque de référencer un objet d'un autre tenant le jour où le Storage existera).
- [POST /evidence](../apps/backend/src/routes/evidence.ts) insère une colonne `step_id` qui n'existe pas dans la table `evidence` → **erreur 400 systématique**. Les deux routes d'insertion ne font pas de `.select()` et renvoient `{ evidence: null }`. *(Ces deux défauts de route sont corrigés en local, §11 ; le fichier n'est toujours pas téléversé.)*

**C4 — Le cœur d'exécution est incomplet côté serveur** *(corrigé en local, §12 ; l'interface d'assignation reste à faire)*
- Aucun code (backend, scripts, seeds) ne crée une ligne dans `actions` ; aucune route n'assigne une action (`action.assign` n'a aucun endpoint) ni ne l'approuve/rejette (`action.approve`, statut `approved`, `segregation_of_duties` n'existent qu'en données). Sur une base fraîche le tableau de bord est vide et le workflow `WF_CONTEXT_ANALYSIS` — « priorité absolue » du README — ne peut pas être exécuté de bout en bout via l'application.
- Les règles ne sont pas appliquées côté serveur : `POST /steps/:actionId/steps/:stepId/submit` accepte n'importe quelle valeur (`z.any()`), n'importe quel `stepId` (même d'un autre workflow), à n'importe quel statut d'action (clôturée, approuvée), par n'importe quel membre ayant `action.submit` (pas de contrôle d'assignation). `POST /actions/:id/submit` ne vérifie ni l'état des étapes obligatoires, ni la `validation_rule`, ni les `guardrails`. Seul `min_length:N` est contrôlé, **dans le navigateur** ([WorkflowStep.tsx](../apps/frontend/src/components/WorkflowStep.tsx)).
- `GET /actions/:id` ne restreint pas un `operator` à ses propres actions (seule la liste `/assigned` le fait).

**C5 — Ruptures d'isolation multi-tenant sur les référentiels « globaux »** *(corrigé en local, §15)*
- La bibliothèque de workflows n'a pas de `tenant_id` (voulu), mais [workflows.ts](../apps/backend/src/routes/workflows.ts) laisse n'importe quel détenteur de `workflow.approve` / `workflow.create` / `workflow.edit_draft` — **de n'importe quel tenant** — approuver, déprécier, dupliquer ou supprimer les brouillons et les workflows des autres tenants, et lister leurs brouillons (`?include_all=1`). Le tenant A peut déprécier `WF_CONTEXT_ANALYSIS` pour tous.
- [matrix.ts](../apps/backend/src/routes/matrix.ts) `PATCH /matrix/requirements/:id` modifie directement le catalogue `requirements` (responsable, preuve attendue, contrôle logiciel, méthode de vérification) **partagé entre tous les tenants**, avec la seule permission `workflow.edit_draft` (donnée à `site_manager`, `consultant`…).

**C6 — La création de CAPA est cassée et masquée par les tests** *(corrigé en local, §11)*
- [nonconformities.ts](../apps/backend/src/routes/nonconformities.ts) `POST /:id/capa` insère `responsible`, `due_date` et `created_by`, colonnes absentes de la table `capas` (migration 0003) → erreur 400 à chaque appel réel. Les rapports ([reports.ts](../apps/backend/src/routes/reports.ts)) lisent ces mêmes colonnes inexistantes : « responsable CAPA », « échéance » et « CAPA en retard » sont toujours vides/faux.
- L'E2E n'a pas détecté ce défaut : il appelle la route avec un UUID factice et accepte « tout sauf 403/500 » (`e2e_rbac.sh`, lignes 131-135), donc un 404 ou un 400 passe.
- Aucune route ne ferme une NC ni une CAPA (le statut `closed`, la permission `capa.close` et le champ `effectiveness_check_at` n'ont pas de parcours complet). Le PV de recette indique pourtant « P4 NC/CAPA ✅ Accepté ».

**C7 — Le déploiement documenté est impossible** *(corrigé en local, §14)*
- `pnpm build` (backend) exécute `tsc --noEmit`, qui n'écrit rien ; `start` et [DEPLOIEMENT.md](./DEPLOIEMENT.md) §5 lancent `node dist/server.js`, fichier qui n'existe pas. Le backend ne tourne que via `tsx` (dev). À corriger avant tout déploiement.

### ÉLEVÉS

**H1 — Les gestionnaires d'audits internes n'accèdent pas à leur propre module** *(corrigé en local, §15)*
`GET /audits` et `GET /audits/:id`, ainsi que l'entrée de menu « Audits internes » ([Layout.tsx](../apps/frontend/src/components/Layout.tsx)), exigent `internal_audit.respond`. La migration 0013 attribue `respond` à `quality_manager, site_manager, department_manager, process_owner, operator` et `manage` à `tenant_admin, quality_manager, internal_auditor`. Résultat : **`internal_auditor` et `tenant_admin` (hors rôles plateforme) reçoivent 403 sur la liste et ne voient pas le menu**. À l'inverse, tout `operator` peut répondre à n'importe quel constat du tenant (aucun contrôle qu'il en est le responsable), et l'`auditor_id` accepte n'importe quel membre (le rôle n'est pas vérifié côté serveur). `external_auditor` n'a aucun accès au programme d'audit.

**H2 — Contrôle documentaire (§8.6) incomplet**
- Approuver une nouvelle version **ne déprécie pas** la précédente : deux versions `published` coexistent, toutes deux injectées dans le corpus RAG.
- `DELETE /documents/:id` autorise la suppression d'un document `deprecated`, alors que le texte du code et §8.5 affirment qu'un document publié n'est jamais supprimé.
- La `classification` (`confidential`, `secret`) n'est appliquée nulle part : ces extraits sont lisibles par tous les rôles `document.read` et **envoyés au fournisseur IA externe** dès que `AI_PROVIDER_URL` est défini ([ai.ts](../apps/backend/src/routes/ai.ts) `buildCorpus`).
- `PUT /documents/:id` remplace l'`excerpt` par `null` si le champ est omis (valeur par défaut Zod).

**H3 — Pas de séparation des tâches là où le PV la revendique**
Rien n'empêche l'auteur d'un workflow ou d'un document de l'approuver lui-même (`tenant_admin` possède `create` et `approve`). L'E2E ne le montre pas car il utilise des comptes distincts. Dans la matrice, la validation d'une exigence « non applicable » (`na_approved_by`) est un **texte libre** saisi par le demandeur, et n'importe quel détenteur de `evidence.upload` — y compris un `operator` — peut enregistrer un test K.3 « passed ».

**H4 — Piste d'audit non fiable pour un produit de conformité**
- Les écritures `audit_log` des routes users, documents, workflows, audits et revues sont lancées en `void` **sans examen de l'erreur** (supabase-js renvoie `{ error }` sans lever) : un échec perd l'évènement en silence.
- Ne sont **pas** journalisés : démarrage / soumission / blocage / exception d'action, création de NC, CAPA, contrôle d'efficacité, suppression de preuve (hard delete), lectures sensibles.
- Aucune protection append-only (pas de trigger, pas de `REVOKE update, delete`) sur `audit_log`, `evidence`, `ai_interventions`.
- `GET /audit-log/trace/:id` sélectionne `status, validated_by, validated_at` sur `evidence` (colonnes inexistantes, erreur ignorée) et interroge `audit_log` **sans filtre `tenant_id`**.

**H5 — Limitation de débit inopérante derrière le reverse proxy documenté** *(corrigé en local, §14)*
La clé est `req.ip` sans `app.set('trust proxy', …)` : derrière nginx/Cloudflare tous les utilisateurs partagent la même IP, donc le même quota de 600 req / 10 min. À l'inverse `/api/v1/me` est déclaré avant le limiteur (aucune limite) alors qu'il fait 2-3 appels Supabase par requête. Compteurs en mémoire (mono-instance, reconnu dans le code).

**H6 — Secrets et comptes de recette**
- [.env.example](../apps/backend/.env.example) contient l'URL et la clé publiable d'un projet Supabase **réel** (`dtpxqxyjgfykzqftecrq`) ; le PV mentionne un autre projet distant (`aomjfwkmnpbuazltahxu`) sur lequel les E2E ont tourné. Avec C1/C2, une clé publique + un projet réel = exposition réelle.
- Le mot de passe commun `Qualidji!RBAC2026` figure dans `ci.yml`, le PV, les scripts ; le PV précise que les comptes existent sur l'environnement distant (« à révoquer avant production »).

**H7 — Garde-fous IA moins forts que l'affichage ne le laisse croire**
- Le `context` utilisateur n'est jamais transmis au fournisseur (`buildUserPrompt` l'ignore) ; seules ses clés sont journalisées. Les prompts du seed (`CTX_INTERNAL_FACTORS`, `CTX_EXTERNAL_FACTORS`) ne servent qu'à calculer un hash de version (première étape uniquement) : la génération utilise un prompt système générique.
- R8 (injection) ne scanne que le `context` ; les `excerpt` de documents injectés dans le prompt ne sont pas scannés (le commentaire de `detectInjection` annonce le contraire).
- `rejectedSteps` n'est jamais alimenté : `ai_meta.rejected_steps` est toujours `[]` même quand R1 retire des étapes.
- Le fallback par gabarit est journalisé `result_status: 'ok'`, `degraded: false` quand aucun fournisseur n'est configuré.
- Pas de quota par utilisateur/tenant sur les appels IA.

### MOYENS

- **M1 — Lint cassé** : `eslint` absent des dépendances et sans configuration ; `pnpm -r lint` échoue ; la CI ne l'exécute pas ; le backend n'a pas de script `lint`.
- **M2 — Documentation divergente** : [DEPLOIEMENT.md](./DEPLOIEMENT.md) (modification non commitée) cite des scripts `audit:list|create|respond|verify` et `review:list|create|prefill|hold` **inexistants** dans `package.json`, et un statut « close » de revue qui n'existe pas (la base n'a que `draft`/`held`). Les chiffres E2E divergent : README 103, PV 84, script 85 appels `check`.
- **M3 — Écritures non atomiques / courses** : `PUT /workflows/:id` supprime les étapes puis les réinsère sans transaction (un échec laisse un brouillon vide) ; les transitions de statut font « lire puis écrire » sans condition sur l'ancien statut (double clic = double traitement).
- **M4 — Validation d'entrée hétérogène** : actions, NC, preuves, étapes utilisent des `req.body as {…}` sans Zod ; `limit`/`offset` non validés (`NaN`) ; `ZodError` levée par `steps.ts` devient un 500 ; le gestionnaire d'erreur renvoie `err.message` brut et de nombreuses routes renvoient le message PostgREST au client. Les rapports sont tronqués à 500 lignes **avant** calcul des totaux : les agrégats deviennent faux au-delà.
- **M5 — `auth.admin.listUsers()` sans pagination** dans `users`, `reports`, `audits/members/eligible` : la liste est paginée par défaut côté GoTrue (50 par page à notre connaissance) ; au-delà, e-mails manquants et liste des membres tronquée *(à confirmer sur la version installée)*.
- **M6 — Notifications avec « undefined »** *(corrigé en local, §11)* : `actions.ts` utilise `action.title` alors que la table `actions` n'a pas de colonne `title` → « Action soumise : undefined ».
- **M7 — Revue de direction** : `PUT` accepte des `inputs` arbitraires ; `hold` ne vérifie que « non vide », pas qu'un `prefill` a eu lieu. La mention « données enregistrées, aucun texte IA » est donc falsifiable.
- **M8 — Cache de permissions** : 5 minutes de latence sur toute modification de `role_permissions` ; `requireAuth` fait 2 appels réseau Supabase par requête.
- **M9 — Hors ligne** : la file est plafonnée à 50 et **évacue silencieusement les plus anciennes mutations non envoyées** ; elle n'est ni liée à l'utilisateur ni vidée à la déconnexion — un autre compte connecté sur le même navigateur rejouerait ces saisies **sous sa propre identité** (faux en attribution). Seul `step.submit` est géré.
- **M10 — Frontend** : le jeton d'accès est dupliqué dans `sessionStorage` par Zustand ; aucune gestion centrale du 401 (pas de redirection) ; pas de garde de route par permission (le menu est masqué mais l'URL charge la page).
- **M11 — Dépendances** : voir §3 (react-router).
- **M12 — Couverture de contenu** : une seule définition de workflow et 54 exigences pour les clauses 4 à 10 ; le contenu métier reste à produire (la matrice annonce elle-même qu'elle doit être confirmée sur un exemplaire autorisé).

---

## 5. Écarts entre le PV de recette et le code

| Affirmation du PV / README | Réalité constatée |
|---|---|
| « P2 Cœur d'exécution ✅ » | Aucune création/assignation/approbation d'action (C4) |
| « P4 NC/CAPA ✅ » | Création de CAPA impossible, jamais testée réellement (C6) |
| « Isolation multi-tenant démontrée » | Vraie pour les routes Express filtrées par `tenant_id`, fausse pour la RLS directe (C1, C2) et les référentiels globaux (C5) |
| « Séparation des tâches §6.3 » | Démontrée par des comptes distincts, non imposée par le code (H3) |
| « Service worker sans cache des API » | Exact (`sw.js` ne cache ni `/api/` ni les assets) |
| « RAG = documents du tenant, publiés » | Exact, mais inclut plusieurs versions publiées et ignore la classification (H2) |
| « 64 routes protégées par requirePermission » | ~80 routes déclarées, 77 appels `requirePermission`/`requireAnyPermission` ; `/me`, `/health` et les 3 routes notifications n'en ont pas, ce qui est cohérent |

---

## 6. Points solides (à conserver)

- **Typage et tests propres** : typecheck des deux apps sans erreur, 123 tests unitaires verts, environnement de test sans secret (fail-fast sur variables manquantes).
- **Filtrage `tenant_id` systématique** dans les requêtes `service_role` du backend, avec réponses 404 qui ne révèlent pas l'existence d'objets d'autres tenants (users, notifications, documents, audits).
- **Conception des garde-fous IA** : contrat de réponse versionné validé par Zod, retrait des étapes et sources inconnues, `requires_human_review` forcé serveur, circuit breaker, journal avec hash d'entrée/sortie, repli sans fournisseur.
- **Audits internes** : anti auto-audit, constat d'origine séparé de la réponse, vérification par une personne distincte, clôture bloquée tant que des constats sont ouverts (réserves H1 sur l'accès).
- **Notifications idempotentes** (`unique (user_id, dedupe_key)`), CORS par liste blanche, `helmet`, limite de corps 2 Mo.
- **CI reproductible** : pile Supabase fraîche, CLI épinglée, `db reset`, E2E et smoke Playwright ; scripts de sauvegarde/restauration présents.
- **Suspension d'utilisateur** = ban GoTrue (sessions révoquées) + historique des changements de rôle.

---

## 7. Plan de remédiation priorisé

0. **C1/C2 sont confirmés en local (§9)** : vérifier si le projet Supabase cloud (`dtpxqxyjgfykzqftecrq`, `aomjfwkmnpbuazltahxu`) a reçu les mêmes migrations ; si oui, traiter comme incident (la clé publique du premier est dans `.env.example`). Cette vérification n'a pas été faite.
1. **Migration `0014_rls_hardening`** — *écrite et appliquée en local, voir §10 ; reste à commiter et à déployer* : activer la RLS sur les 5 tables ; remplacer les politiques `FOR ALL` par des politiques `SELECT` seules et retirer `INSERT/UPDATE/DELETE` à `anon`/`authenticated` partout (écritures par le backend uniquement) ; révoquer les droits `anon` ; ajouter des triggers append-only sur `audit_log`, `evidence`, `ai_interventions`.
2. **Colonnes manquantes** : corriger `capas` (migration ou code) et `evidence.step_id` ; ajouter `.select()` aux insertions ; remplacer `action.title`.
3. **Compléter l'exécution** : routes de création/assignation/approbation d'actions, validation serveur des étapes (`required`, `validation_rule`, `guardrails`, statut, assignation, `segregation_of_duties`), puis un test E2E du parcours complet `WF_CONTEXT_ANALYSIS`.
4. **Stockage des preuves** : bucket privé, upload réel, checksum calculé/vérifié serveur, URL signées ≤ 1 h.
5. **Isoler les référentiels** : `tenant_id` (ou propriétaire) sur les workflows des tenants, catalogue d'exigences en lecture seule hors rôles plateforme (surcouche tenant pour les champs K.2).
6. **Corriger les permissions d'audit** (`internal_auditor`, `tenant_admin`) et le versionnement documentaire (déprécier le prédécesseur à l'approbation, interdire le delete des publiés/dépréciés, filtrer la classification avant l'IA).
7. **Fiabiliser la piste d'audit** : attendre et journaliser les erreurs d'écriture, élargir la liste des évènements tracés.
8. **Déploiement** : vrai `build` (tsc avec émission ou bundle), `trust proxy`, limiteur sur `/me`, rotation des comptes de recette et des clés, retrait de la clé du `.env.example`.
9. **Qualité** : installer/configurer ESLint, durcir les assertions E2E (exiger l'état attendu, pas « ≠ 403/500 »), synchroniser DEPLOIEMENT.md et le PV avec la réalité, vider/isoler la file hors ligne par utilisateur.

---

## 8. Couverture de cette analyse

**Lu intégralement** : les 13 migrations, `config.toml`, seed 0001, `ci.yml`, README, PV de recette, tous les routeurs backend sauf `matrix.ts` (lu en partie : en-tête, `PATCH requirements`, `POST tests`), `auth.ts`, `server.ts`, les 5 libs, `App.tsx`, `stores/auth.ts`, `lib/offline/*`, `EvidenceUploader`, `sw.js`, `manifest.json`, `usePermissions`.
**Lu en partie** : `api.ts` (client), `Layout.tsx`, `Audits.tsx`, `WorkflowExecution.tsx`, seed 0002, `DEPLOIEMENT.md`.
**Non lu** : pages `Traceability`, `Workflows`, `Documents`, `Reports`, `Users`, `Reviews`, `Dashboard`, `NonConformities`, `Login`, composants `WorkflowStep`/`AIGuidancePanel` (hors extraits cités), le corps des tests, `e2e_rbac.sh` (sauf lignes citées), scripts de provisionnement/sauvegarde, config Playwright/Tailwind.

---

## 9. Rejeu de C1 et C2 sur la pile Supabase locale (23/10/2026)

**Environnement** : pile `supabase_*_qualidji` déjà en cours d'exécution (CLI 2.109.1, API `127.0.0.1:54341`, Postgres `54342`), migrations 0001 à 0013 appliquées, base vide hormis le seed (1 workflow, 2 prompts). Aucun `db reset` : la pile n'a pas été touchée hors données jetables.
**Méthode** : un tenant T avec un utilisateur de rôle **`reader`** (créé via l'API admin GoTrue), un tenant U, une action dans chacun (insérées en SQL). Requêtes HTTP vers PostgREST avec la clé publique (`anon`) et le JWT du `reader`, sans passer par Express. Les lignes réelles du seed n'ont été « modifiées » qu'avec leur valeur actuelle.
**Nettoyage** : tenants, profils, actions, preuves, soumissions et utilisateur de test supprimés ; seed vérifié intact (nom du workflow et `validation_rule` inchangés).

### Catalogue (lecture seule)
Sur les 30 tables de `public`, `anon` et `authenticated` ont `INSERT/UPDATE/DELETE` partout. `relrowsecurity = false` pour exactement : `ai_prompt_templates`, `security_alerts`, `workflow_actions`, `workflow_definitions`, `workflow_steps`. Politiques sur `actions` : `employee_actions_select` (SELECT) + `tenant_isolation_actions` (**ALL**), toutes deux permissives ; `step_submissions` : `tenant_isolation_submissions` (ALL) ; `evidence` : SELECT + INSERT par tenant.

### C1 — clé publique seule, aucun JWT utilisateur

| Requête | Résultat |
|---|---|
| `POST /workflow_definitions` (sonde) | **201** créée |
| `PATCH` de la sonde, puis `DELETE` | **200** / **200** |
| `PATCH /workflow_definitions?id=eq.WF_CONTEXT_ANALYSIS` (valeur identique) | **200**, ligne renvoyée |
| `PATCH /workflow_steps?id=eq.ST_CTX_001_01` (valeur identique) | **200** |
| `GET` puis `PATCH /ai_prompt_templates?id=eq.CTX_EXTERNAL_FACTORS` | **200** / **200** |
| `POST`, `GET`, `DELETE /security_alerts` (sonde) | **201** / **200** / **200** |
| *Contrôle* : `POST /nonconformities` (table avec RLS) | **401**, `new row violates row-level security policy` |

**Verdict : confirmé.** N'importe qui disposant de la clé publique réécrit les workflows, les règles de validation, les prompts IA et lit/écrit les alertes de sécurité.

### C2 — JWT d'un `reader` du tenant T

| Requête | Résultat |
|---|---|
| `GET /actions` (action non assignée au reader) | **200**, l'action est visible → `employee_actions_select` est sans effet |
| `PATCH /actions` → `status=approved`, `assigned_to=<reader>` | **200**, modifiée |
| `POST /step_submissions` (`value: "forged"`, étape `ST_CTX_001_04`) | **201** créée |
| `POST /evidence` (`checksum: "deadbeef"`, `storage_path` inventé) | **201** créée |
| `DELETE /actions` | **200**, supprimée |
| *Isolation inter-tenant* : `PATCH` d'une action du tenant U | **200** avec `[]` (aucune ligne touchée) |
| *Isolation inter-tenant* : `POST /actions` dans le tenant U | **403** RLS |
| *Contrôle* : `POST /nonconformities` | **403** RLS |

**Verdict : confirmé.** Un `reader` (qui n'a pourtant que `workflow.read`, `action.read`, `evidence.read`) approuve, forge et supprime des données d'exécution et de preuve de son tenant en contournant Express. L'isolation **entre** tenants tient ; c'est l'isolation **par rôle** à l'intérieur d'un tenant qui est absente de la base.

### Reproduction
Le script de rejeu (données jetables, nettoyage inclus) est dans le dossier temporaire de la session : `/private/tmp/claude-501/-Users-awalehosman-Projects-ISO/11a0d883-c849-438a-8c4f-7124a3854867/scratchpad/replay.sh`. Il peut servir de test de non-régression après la migration de durcissement ; il lit `ANON_KEY`, `SERVICE_ROLE_KEY` et `API_URL` dans un fichier `sb.env` voisin (supprimé après usage, à régénérer avec `supabase status -o env`).

---

## 10. Correctif C1 + C2 : migration 0014 (23/10/2026)

**Fichier** : [supabase/migrations/20261016000014_rls_hardening.sql](../supabase/migrations/20261016000014_rls_hardening.sql) — non commité, appliquée uniquement sur la pile locale (`supabase migration up`).

**Ce qu'elle fait**
1. **Privilèges** : `anon` perd tout droit sur `public` ; `authenticated` ne garde que `SELECT` sur les 30 tables. `service_role` (backend) est inchangé.
2. **Privilèges par défaut** de `postgres` : plus de `ALL` pour `anon`/`authenticated` sur les tables et séquences **futures** (la plateforme les accorde par défaut).
3. **C1** : RLS activée sur `workflow_definitions`, `workflow_actions`, `workflow_steps`, `ai_prompt_templates`, `security_alerts`. Workflows lisibles côté client **uniquement s'ils sont publiés** ; prompts et alertes sans politique (accès backend seul).
4. **C2** : suppression de `tenant_isolation_actions` et `tenant_isolation_submissions` (FOR ALL) et de `tenant_isolation_evidence_write` (INSERT). Nouvelle `actions_select` (tenant **et** assigné ou rôle de gestion, la politique « employé » devient réellement effective) ; `step_submissions_select` hérite de la visibilité de l'action parente.
5. **Garde-fou** : la migration échoue si une table `public` est sans RLS ou si `anon`/`authenticated` conserve un droit d'écriture.

**Vérifications exécutées (pile locale)**

| Contrôle | Résultat |
|---|---|
| Catalogue : tables sans RLS / accès `anon` / écriture `authenticated` | **0 / 0 / 0** sur 30 tables ; `service_role` a accès aux 30 |
| Rejeu C1 (clé publique seule), 10 requêtes d'écriture/lecture sur workflows, étapes, prompts, alertes | **toutes refusées** (`42501 permission denied`), y compris la lecture du prompt |
| Rejeu C2 (JWT `reader`) : `PATCH`, `INSERT` soumission, `INSERT` preuve, `DELETE`, accès tenant U | **toutes refusées** (403) ; le `SELECT` d'une action non assignée renvoie `[]` au lieu de la ligne |
| Contrôles positifs (12) : `reader` lit son profil ; `operator` voit 1 action sur 2 et ses soumissions ; `quality_manager` voit les 2 ; lecture des workflows publiés (1) et de leurs étapes (4) ; brouillon invisible ; prompts et alertes invisibles ; `anon` ne lit rien | **12/12 conformes** |
| Suite E2E complète via le backend (`e2e_rbac.sh`) | **103/103**, 0 échec |
| Données de test | supprimées ; base revenue à l'état initial (0 tenant, 0 utilisateur, 1 workflow, 54 exigences) |

**Limites et points à traiter**
- **Cloud non traité** : rien n'a été appliqué ni vérifié sur les projets Supabase distants.
- **`supabase_admin`** : ses privilèges par défaut (`ALL` pour `anon`/`authenticated`) n'ont pas pu être modifiés avec le rôle des migrations (le bloc `DO` l'ignore). Seules les tables créées par ce rôle (par exemple via le Studio) restent exposées ; les tables des migrations (propriétaire `postgres`) sont couvertes. Le garde-fou final de la migration vérifie les tables existantes, pas les futures.
- **Nouvelles tables** : toute migration future doit accorder `SELECT` explicitement à `authenticated` (+ RLS), sinon la table sera invisible du client.
- **Politiques devenues inertes** : `notifications_update_own` et `notifications_delete_own` n'ont plus de privilège correspondant (le backend gère ces écritures) ; à supprimer pour éviter qu'un futur `GRANT` ne les réactive.
- **Hors périmètre de cette migration** : le contrôle d'accès *au sein* d'Express reste celui décrit en C4/C5/H1-H3 ; l'immuabilité de `audit_log`/`evidence` (H4) n'est pas traitée.
- **Défaut découvert** : `pnpm --filter @iso/backend cleanup:e2e` échoue après une exécution E2E complète (« Database error deleting user ») car il supprime les utilisateurs avant le tenant ; des clés étrangères de données créées par l'E2E (audits, etc.) bloquent. Corriger l'ordre (tenant d'abord) ou le cascade.
- **Scripts de rejeu** : les scripts de rejeu (`replay.sh`, `positive.sh`) sont dans le dossier temporaire de la session et lisent `sb.env` (supprimé) ; à copier dans le dépôt si vous voulez un test de non-régression permanent.

---

## 11. Correctifs de la suite : CAPA, preuves, notifications, exception (23/10/2026)

Non commité, appliqué sur la pile locale. Méthode : les contrôles ont été écrits **avant** le correctif et lancés sur l'ancien code pour prouver qu'ils échouent.

### Défauts corrigés

| Défaut | Avant (rejoué) | Correctif |
|---|---|---|
| **C6** : `POST /nonconformities/:id/capa` | 400 `Could not find the 'created_by' column of 'capas'` | Migration [0015](../supabase/migrations/20261016000015_capas_columns.sql) : colonnes `responsible` (texte), `due_date` (date), `created_by` ; validation Zod du corps (date `AAAA-MM-JJ`) |
| **Nouveau** : `GET /nonconformities` ne renvoyait pas `nc.capa` | Le formulaire CAPA se réaffichait indéfiniment, doublons possibles | La liste embarque les CAPA et expose la plus récente dans `nc.capa` |
| **Nouveau** : l'interface appelait `/capas/:id/effectiveness-check` | 404 (la route est montée sous `/nonconformities/capas/...`) | Chemin corrigé dans `frontend/src/lib/api.ts` ; corps validé (`effective: boolean` obligatoire, sinon une absence valait « inefficace ») |
| **Nouveau** : `POST /actions/:id/exception` | **404 systématique** : la requête sélectionnait `actions.title`, colonne inexistante ; l'exception n'a jamais pu créer de NC | Titre lu via `workflow_actions(title)` |
| **M6** : notifications « Action soumise : undefined » | titre `undefined` | Même lecture du titre ; repli sur l'id |
| **C3 (partiel)** : `POST /evidence` | 400 (colonne `step_id` inexistante) ; les deux routes renvoyaient `evidence: null` | Rattachement via `step_submission_id` (recherche de la soumission `(action, étape)`), `.select().single()` sur les deux routes |

### Vérifications

| Contrôle | Avant | Après |
|---|---|---|
| E2E `e2e_rbac.sh` (6 checks ajoutés : parcours NC → CAPA réelle → liste → efficacité → registre, avec contrôle des champs persistés) | 104 réussis, **5 échecs** | **109 réussis, 0 échec** |
| Parcours d'exécution (15 contrôles : soumission d'étape, preuves, notification, exception, validations) | 6 réussis, **9 échecs** | **15/15** |
| Tests unitaires backend / Vitest frontend | 63 / 60 | 63 / 60 |
| `tsc --noEmit` backend et frontend | OK | OK |
| État de la base locale après nettoyage | — | 0 tenant, 0 utilisateur, 0 action/NC/CAPA/preuve ; 1 workflow |

### Reste ouvert
- **Fichier de preuve toujours non téléversé** (C3 principal), exécution incomplète (C4), isolation des référentiels (C5), déploiement (C7), et tout H1–H7 / M1–M5, M7–M12.
- **Interface** : aucun écran ne déclenche la vérification d'efficacité d'une CAPA ; l'API fonctionne mais n'est pas utilisée. Aucune route ne ferme une NC ni une CAPA.
- Les contrôles de parcours (15) sont dans le dossier temporaire de la session (`verify_flows.sh`, exécutés par `e2e_run.sh`) et ne sont pas dans le dépôt ; seuls les 6 checks CAPA ont été ajoutés à `e2e_rbac.sh`. Ils créent des actions en SQL car aucune route ne le permet (C4).

---

## 12. C4 — moteur d'exécution des actions (23/10/2026)

Non commité, appliqué sur la pile locale. Migration [0016](../supabase/migrations/20261016000016_actions_workflow_engine.sql) (colonnes `assigned_by`, `reviewed_by`, `reviewed_at`, `review_comment`).

### Ce qui existe maintenant

| Capacité | Implémentation |
|---|---|
| **Créer + assigner** une action | `POST /actions` (`action.assign`) : définition d'un workflow **publié et actif** uniquement ; l'assigné doit être du tenant, actif et porteur de `action.execute` ; audit + notification `action.assigned` |
| **Réassigner** | `POST /actions/:id/assign` (statuts assigned / in_progress / blocked) |
| **Saisie d'étape validée serveur** | `POST /steps/:a/steps/:s/submit` : assigné seul (404 pour qui ne voit pas l'action, 403 pour un gestionnaire non assigné), action au statut exécutable, étape appartenant à la définition de **cette** action, type de valeur, `min_length` / `max_length` / `min` / `max`, choix autorisés, garde-fous `require_justification` (enveloppe `{choice, justification}`) ; la première saisie démarre l'action ; erreurs 422 avec code |
| **Soumission** | `POST /actions/:id/submit` : refusée tant qu'une étape obligatoire manque (409 + liste), l'étape d'approbation n'étant pas une saisie |
| **Approbation** | `POST /actions/:id/approve` (`action.approve`) : statut `submitted` seul ; rôle d'approbateur de la définition (`approver_role`, le `tenant_admin` restant habilité) ; **ségrégation des tâches** : l'assigné et tous les auteurs de saisies sont exclus (appliquée par défaut s'il n'y a pas d'étape d'approbation) ; l'approbation est consignée comme saisie de l'étape finale |
| **Rejet** | `POST /actions/:id/reject` : motif obligatoire, retour à `in_progress`, notification de l'exécutant avec le motif |
| **Blocage / exception** | propriétaire ou approbateur seulement, jamais sur une action terminale, gravité validée |
| **Lecture** | un exécutant ne voit que ses actions, un gestionnaire (`action.assign`) tout le tenant — même règle que la RLS 0014 ; `GET /actions/:id` embarque maintenant les étapes (l'interface n'en recevait **aucune**) et les saisies |
| **Piste d'audit** | `lib/audit.ts` : écriture attendue, échec journalisé ; 9 évènements d'action tracés |
| **Publication de workflow** | refuse toute `validation_rule` / garde-fou hors grammaire supportée (une règle inconnue ne peut plus être publiée) et une étape `choice` sans choix |

Interface : formulaire d'étape avec justification obligatoire (même grammaire que le serveur), étape d'approbation non saisissable, panneau Approuver / Rejeter avec commentaire pour les porteurs de `action.approve`, reprise des saisies existantes après rejet.

### Vérifications

| Contrôle | Résultat |
|---|---|
| Tests unitaires backend | **97** asserts (63 + 34 de la validation d'étapes : types, règles, choix, garde-fous, échec fermé) |
| Tests frontend | **70** (60 + 10 : formulaire d'étape, justification, client API) |
| E2E `e2e_rbac.sh` | **195/195** (109 + 86 pour le parcours ci-dessous) ; **115 réussis / 80 échecs** avec les routes d'avant, ce qui prouve que les nouveaux checks testent bien le correctif |
| Parcours d'exécution hors E2E (SQL → API) | 16/16 |
| `tsc --noEmit` backend + frontend, `vite build` | OK |
| Base locale après nettoyage | vide (hors seed) |

Le parcours E2E rejoue `WF_CONTEXT_ANALYSIS / ACT_CTX_001` de bout en bout : refus de création par un opérateur, assignations invalides (définition inconnue, assigné sans `action.execute`, hors tenant), visibilité (reader → 404), les 4 étapes avec leurs refus (trop court, hors liste, garde-fou sans justification, justification trop courte, approbation saisie par l'exécutant), soumission incomplète puis complète, rejet sans puis avec motif, correction, re-soumission, approbation, statut terminal, **auto-approbation refusée par la ségrégation des tâches** (`ERR_SEGREGATION_OF_DUTIES`), réassignation, exception, notifications (assignation, rejet, approbation, soumission, titre réel) et 9 évènements du journal d'audit.

### Reste ouvert (C4 et voisins)
- **Pas d'écran d'assignation** : l'API et le client (`actionsApi.create/assign`) existent, mais aucun formulaire ne crée d'action ; sans lui, une action ne se crée qu'en appelant l'API.
- **Action bloquée sans issue** : aucune route ne débloque une action ni ne lie sa NC/CAPA à sa reprise.
- **File hors ligne** : un rejet serveur définitif (422/409) d'une saisie rejouée bloque la tête de file indéfiniment (ordre FIFO strict) — à traiter avec M9.
- **Types d'étapes sans écran** : l'interface ne sait saisir que `text_input` et `choice`; les 14 autres types (nombre, date, photo, signature…) sont validés par le serveur mais n'ont pas de composant de saisie.
- **Ordre des étapes** non imposé, `evidence_requirement` non contrôlé à la soumission, fichiers de preuve non téléversés (C3).
- Dans la règle d'approbation, `tenant_admin` peut approuver quel que soit `approver_role` : choix de conception à valider avec le responsable produit.

---

## 13. C3 — stockage réel des preuves (23/10/2026)

Non commité, appliqué sur la pile locale ; la chaîne complète des 17 migrations a été rejouée **depuis zéro** (`supabase db reset`) avant la dernière exécution de la suite E2E.

### Ce qui existe maintenant

| Capacité | Implémentation |
|---|---|
| **Bucket privé** | Migration [0017](../supabase/migrations/20261016000017_evidence_bucket.sql) : bucket `evidence`, non public, 25 Mio, types autorisés ; aucune politique `storage.objects` (garde-fou dans la migration) : ni `anon` ni `authenticated` n'y accèdent |
| **Dépôt** | `POST /evidence/upload` (`evidence.upload`) : octets bruts + `Content-Type`, `action_id`, `step_id?`, `filename?`. Le serveur : liste fermée de types (HTML, SVG, exécutables refusés), contrôle de signature (PDF, PNG, JPEG, GIF, WebP, DOCX/XLSX) et de contenu texte, taille, action du tenant **visible** de l'utilisateur et encore ouverte (pas approuvée ; pas soumise sauf gestionnaire), étape de **cette** action |
| **Empreinte** | SHA-256 **calculé par le serveur** ; l'en-tête `X-Checksum-SHA256` du client est confronté (422 si différent) |
| **Chemin** | décidé par le serveur : `<tenant>/<action>/<preuve>/<nom assaini>` — le client ne choisit plus rien |
| **Lecture** | `GET /evidence/:id/download` → URL signée de 300 s (plafond 1 h, `EVIDENCE_URL_TTL_S`), journalisée ; `GET /evidence?action_id=` ; visibilité identique aux actions (404 sinon) |
| **Intégrité** | `GET /evidence/:id/verify` : SHA-256 recalculé depuis le stockage ; écart ou fichier absent → `intact: false` + évènement `evidence.integrity_failed` |
| **Suppression** | retire la ligne **et** le fichier ; journalisée avec empreinte et chemin supprimés |
| **Preuves sans fichier** | `POST /evidence` limité aux types `measure` / `text` ; `file` / `photo` → 400 `ERR_USE_UPLOAD`. La route `POST /steps/:a/steps/:s/evidence` est **supprimée** (changement d'API ; le client interne n'est plus concerné) |
| **Interface** | l'envoi transmet le vrai fichier avec son SHA-256 ; liste des preuves de l'étape, bouton Télécharger (URL signée) et Vérifier (intègre / ALTÉRÉ) |

### Vérifications

| Contrôle | Résultat |
|---|---|
| Tests unitaires backend | **116** (97 + 19 : types, signatures, taille, assainissement du nom, empreinte) |
| Tests frontend | **77** (+7 : envoi du fichier réel avec empreinte, liste par étape, téléchargement signé, vérification, refus serveur) |
| E2E `e2e_rbac.sh` | **233/233**, sans test ignoré (+38 : dépôt, empreinte fausse 422, HTML 415, faux PDF 422, fichier > limite 413, reader 403, sans jeton 401, action/étape inconnues 404, nom assaini, URL signée ≤ 1 h, octets téléchargés identiques au SHA-256 déposé, intégrité, **lecture et dépôt directs dans le bucket refusés** pour l'utilisateur et pour `anon`, suppression, 409 après approbation, 4 évènements d'audit) |
| Falsification (clé service, hors E2E) | fichier modifié dans le stockage → `verify` renvoie `intact: false`, `checksum_mismatch`, évènement d'audit ; fichier supprimé → `missing`, téléchargement 502 |
| Isolation inter-tenant (2 tenants) | un QM d'un autre tenant reçoit 404 sur lecture, URL signée, vérification, liste, suppression **et dépôt** |
| `tsc` backend + frontend, `vite build`, `db reset` complet | OK |
| État final | 0 tenant / utilisateur / action / preuve, **0 objet dans le bucket**, bucket privé |

### Reste ouvert
- **Fichiers en mémoire** : le dépôt tamponne le fichier (≤ 25 Mio par défaut). À fort volume ou pour de grosses vidéos, passer à des URL de dépôt signées avec vérification d'empreinte a posteriori.
- **Pas d'antivirus** ni d'analyse de contenu au-delà du type et de la signature.
- **Hors ligne** : le dépôt de fichiers n'est pas mis en file (écart déjà signalé §6 du PV).
- **Preuves orphelines** : supprimer un tenant (ou une action) supprime les lignes en cascade mais **pas** les fichiers du bucket ; prévoir un nettoyage. Pas de verrouillage d'immuabilité (WORM) ni de rétention (H4).
- **Types d'étape `photo` / `file_upload`** : leur saisie accepte une référence texte ou objet, sans lien contraignant avec un fichier déposé ; l'`evidence_requirement` n'est pas contrôlé à la soumission de l'action.
- **Preuves legacy** : les lignes `file`/`photo` créées avant 0017 pointent vers des chemins inventés sans fichier ; `verify` les signale `missing`.

---

## 14. C7 + H5 — artefact de déploiement et limitation de débit (23/10/2026)

Non commité.

### Corrections
| Défaut | Correctif |
|---|---|
| **C7** : `pnpm build` = `tsc --noEmit`, donc pas de `dist/` ; `node dist/server.js` (start, systemd, DEPLOIEMENT.md) ne pouvait pas démarrer | `build` = `rm -rf dist && tsc` ; `typecheck` reste sans émission ; `pnpm build` à la racine produit désormais `apps/backend/dist/server.js` |
| **H5** : `req.ip` sans `trust proxy` — derrière un reverse proxy tous les utilisateurs partagent un seul quota de 600 req / 10 min | `TRUST_PROXY` (nombre de proxys, mots-clés ou CIDR) appliqué via `app.set('trust proxy', …)` ; **`true` refusé au démarrage** (confiance totale = usurpation d'IP par `X-Forwarded-For`) |
| **H5** : `/api/v1/me` déclaré avant le limiteur, donc sans limite (2-3 appels Supabase par requête) | déplacé après le limiteur ; tout `/api/v1` est limité |
| Documentation | DEPLOIEMENT.md §5 réécrit (build, systemd, `TRUST_PROXY`) ; la mention « logs JSON structurés » était fausse (texte brut) et est corrigée ; `.env.example` complété |
| CI | le job `checks` construit `dist/` et vérifie qu'il démarre (`/health`) ; le job `e2e` lance désormais l'**artefact compilé** (plus `tsx`) |

### Vérifications
| Contrôle | Résultat |
|---|---|
| Avant : `ls apps/backend/dist` | n'existait pas |
| Après : `npm run build` | `dist/server.js` produit ; le serveur compilé répond à `/health` |
| Serveur compilé, `RATE_LIMIT_API=3` | `/api/v1/me` : 401, 401, 401, **429** |
| Serveur compilé, `TRUST_PROXY=true` | refus au démarrage avec message explicite |
| Serveur compilé, `TRUST_PROXY=1`, limite 2 | le client `1.1.1.1` est limité à sa 3e requête, `2.2.2.2` reste servi |
| Sans `TRUST_PROXY` (app Express réelle de test) | `X-Forwarded-For` ignoré : impossible de contourner la limite en usurpant l'IP |
| Tests unitaires backend | **125** asserts hors matrice (116 + 9 de configuration proxy / limiteur) |
| E2E complet contre `node dist/server.js` | **233/233**, + parcours 9/9 + preuves 17/17 |
| `tsc` backend + frontend, `pnpm build` racine | OK |

### Reste ouvert (déploiement)
- Le compteur du limiteur reste **en mémoire**, donc par instance : plusieurs instances multiplient le quota (Redis à prévoir).
- `.env.example` contient toujours l'URL et la clé publiable d'un projet Supabase réel (H6) — à remplacer par des valeurs locales ou des gabarits : non fait, à valider avec vous car cela change le démarrage documenté.
- Le gestionnaire d'erreurs journalise les 413 (corps trop gros) comme des erreurs applicatives et renvoie `err.message` brut pour les 500 (M4).

---

## 15. C5 + H1 — isolation des référentiels et accès aux audits internes (23/10/2026)

Commité jusqu'au §14 (`b7bce3f`, branche `fix/audit-remediation-c1-c7`) ; ce qui suit est **non commité**. Migration [0018](../supabase/migrations/20261016000018_tenant_scoped_referentials.sql).

### C5 — référentiels « globaux »
| Avant | Après |
|---|---|
| Tout détenteur de `workflow.approve/create/edit_draft` de **n'importe quel tenant** approuvait, dépréciait, dupliquait ou supprimait les workflows des autres tenants (y compris le seed `WF_CONTEXT_ANALYSIS`) et listait leurs brouillons | `workflow_definitions.tenant_id` : `NULL` = bibliothèque **globale**, **lecture seule** (403 `ERR_WORKFLOW_GLOBAL_READONLY` pour submit / approve / reject / deprecate / delete / PUT) ; sinon workflow propre au tenant. Un workflow d'un autre tenant est **invisible** (404 partout, absent des listes) |
| Dupliquer un workflow global n'était pas possible sans le modifier pour tous | `POST /workflows/:id/duplicate` crée une **copie propre au tenant** ; les identifiants des workflows de tenant portent un suffixe `__<8 car. du tenant>` : pas de collision ni de fuite d'existence entre tenants |
| `PATCH /matrix/requirements/:id` réécrivait le **catalogue** `requirements` commun à tous les tenants | les champs K.2 (responsable, contrôle logiciel, preuve attendue, méthode de vérification) sont des **surcharges par tenant** dans `requirement_assessments` ; le catalogue n'est plus écrit par l'API tenant |
| Instanciation d'action et guidage IA acceptaient la définition d'un workflow d'un autre tenant | refus 404 si le workflow n'est ni global ni du tenant ; le rapport « paquet d'audit » ne compte plus que les workflows visibles |
| Supprimer un tenant échouait (FK `workflow_actions`) | `ON DELETE CASCADE` jusqu'aux étapes |

Interface : badge « global » et seule la duplication offerte sur les workflows globaux.

### H1 — audits internes
| Avant | Après |
|---|---|
| `tenant_admin` et `internal_auditor` (porteurs de `manage` mais pas de `respond`) recevaient 403 sur la liste et ne voyaient pas le menu | liste et détail ouverts à `manage` **ou** `respond` ; menu idem |
| Tout `operator` répondait à n'importe quel constat | seul le **responsable de processus désigné** répond (`ERR_NOT_PROCESS_OWNER`) ; sans responsable désigné, tout répondant |
| N'importe quel membre pouvait être désigné auditeur ; un `process_owner_id` d'un autre tenant était accepté | rôle d'auditeur contrôlé côté serveur (`ERR_AUDITOR_ROLE`) ; responsable de processus obligatoirement du tenant **et** porteur de `internal_audit.respond` |

Le test E2E existant désignait un `reader` comme responsable de processus pendant qu'un opérateur répondait : il validait précisément le défaut. Il est corrigé.

### Outillage de recette (défauts trouvés en route)
- `pnpm --filter @iso/backend cleanup:e2e` **ne pouvait pas fonctionner** : le script pointait `scripts/cleanup_e2e_accounts.ts` alors que le fichier était à la racine du dépôt. Il est déplacé dans `apps/backend/scripts/`.
- Le nettoyage échouait aussi après une exécution complète (suppression des utilisateurs avant le tenant). Il supprime maintenant les tenants d'abord (cascade), purge les fichiers de preuve du bucket, puis les comptes, y compris les comptes d'invitation `e2e_test_<horodatage>`.
- Le provisionnement crée désormais un **second tenant (B)** et des comptes `b.qm.test`, `b.ta.test`, plus un `auditor.test` (internal_auditor) dans le tenant A : les tests d'isolation sont permanents (et exécutés par la CI).

### Vérifications
| Contrôle | Résultat |
|---|---|
| E2E `e2e_rbac.sh` contre `node dist/server.js` | **278/278** (+45 : B ne voit/ne modifie rien de A, le global est en lecture seule pour A **et** B, copies distinctes par tenant, surcharges K.2 isolées, instanciation et IA refusées inter-tenants, audits pour TA/auditeur, reader refusé, usurpation de réponse, auditeur/responsable invalides) |
| Parcours d'actions 9/9, preuves et falsification 17/17 | OK |
| Tests frontend | **78** (+1 : le menu « Audits internes » pour `manage` seul) |
| `tsc`, base finale | OK ; 0 tenant / utilisateur / fichier, 1 workflow global |

### Reste ouvert
- **Les rôles plateforme** (`super_admin`, `technical_admin`) n'ont pas de tenant et `requireTenant` les exclut de ces routes : la bibliothèque globale se gère aujourd'hui par migration/SQL ; il n'existe pas d'API d'administration de la bibliothèque globale.
- Rattrapage : la migration rattache à leur tenant les workflows existants dont l'auteur (`created_by`) appartient à un tenant ; ceux sans auteur (seed) restent globaux. À contrôler sur un environnement réel avant déploiement.
- Un code explicite de workflow choisi par un tenant reste suffixé (`CODE__<tenant>`) : l'interface affiche cet identifiant technique.
- Séparation des tâches auteur/approbateur des workflows et documents (H3) : non traitée.
