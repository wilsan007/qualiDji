# Guide de déploiement — Compliance Execution Platform (QualiDji)

Ce document décrit le déploiement et l'exploitation de la plateforme ISO 9001 · IA
Assistant Terrain. Il complète le PV de recette (`docs/PV_RECETTE_V5.md`) et
rapporte la campagne de **déploiement, sauvegarde/restauration et exploitation**
(P8) décrits dans le plan de réalisation.

> Référence : P7b conclue — CI reproductible avec pile Supabase fraîche.
> Versions des outils citées sont figées dans `.github/workflows/ci.yml` et dans
> `supabase/config.toml`.

---

## 1. Topologie

| Couche | Technos | Rôle |
|---|---|---|
| Frontend | React 18+, TypeScript strict, Vite, React Router v6, Tailwind, PWA + IndexedDB (dexie) | Interface terrain, mode hors ligne |
| Backend | Node.js 22 LTS, Express, Zod, @supabase/supabase-js | API v1 (`/api/v1`), RBAC, rate limiting, IA encadrée |
| Base de données | PostgreSQL 17 (Docker local / Supabase cloud) | RLS obligatoire, tenant isolation, storage privée |
| IA | `AIProvider` abstrait (OpenAI, Anthropic, Ollama) + fallback template | Assistance sans action autonome |

La couche **base de données** est la source unique de vérité pour le schéma.
Le backend et le frontend sont des côtés applicatifs consommant la base.

---

## 2. Environnements

| Environnement | Base | Backend | Frontend | Accès |
|---|---|---|---|---|
| **local** | Docker (`supabase start`) — `localhost:54321` API, `localhost:54342` Postgres | `pnpm --filter @iso/backend dev` (port 4000) | `pnpm --filter @iso/frontend dev` (port 5173) | `http://localhost:5173` |
| **CI** | Pile Supabase fraîche (`db reset` + seeds) sur GitHub Actions | lancement + suite E2E dans le job `e2e` | `vite preview` (5174) + Playwright | GitHub Actions |
| **cloud staging** | Projet Supabase distant (`qualidji` local) | déployé sur VM/PaaS derrière le reverse proxy | statique hébergée | selon la zone |
| **cloud production** | Projet Supabase distant | process manager (systemd/pm2) | statique | HTTPS |

Le **CI repart systématiquement d'une pile fraîche** (`npx supabase start` →
`db reset` → provisionnement des comptes → backend → E2E → smoke Playwright) ;
il n'y a aucune dépendance à un état de base local ou cloud.

---

## 3. Prérequis

| Outil | Version |
|---|---|
| Node.js | ≥ 22 LTS (Node 22 recommandé) |
| pnpm | 9.12.0 (verrouillé) |
| Supabase CLI | 2.109.1 épinglée dans CI (voir §7) |
| Docker | ≥ 24 (compose intégré à la CLI) |
| git | toute version récente |

Secrets nécessaires :

| Secret | Utilisé pour |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | provision E2E, RLS, seeds |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | accès REST à la base |
| `CORS_ORIGIN` | origines autorisées (CSV) |
| `RATE_LIMIT_API` / `RATE_LIMIT_WINDOW_MS` | protection de l'API (s'applique à tout `/api/v1`, `/me` compris) |
| `TRUST_PROXY` | nombre de reverse proxys devant le backend (`1`, `2`…), `loopback`/`uniquelocal` ou liste d'IP/CIDR ; vide = aucun proxy ; `true` refusé |
| `EVIDENCE_MAX_BYTES` | taille max d'une preuve en octets (défaut 25 Mio, aligné sur le bucket `evidence`) ; le fichier est tenu en mémoire pendant le dépôt |
| `EVIDENCE_URL_TTL_S` | durée des URL signées de téléchargement (défaut 300 s, plafonnée à 3600) |

Les secrets de développement sont **jamais commités** (`.env`/.env.local dans
`.gitignore`). Le `.env.example` montre la forme des valeurs.

---

## 4. Initialisation d'un environnement

```bash
# 1. Récupérer le code + dépendances
git clone <repo>
cd qualidji
pnpm install --frozen-lockfile

# 2. Variables d'environnement (modèles, jamais les secrets)
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
# → éditer apps/backend/.env : SUPABASE_URL, SUPABASE_ANON_KEY, CORS_ORIGIN…

# 3. Pile Supabase locale (dépôt `qualidji`, migrations 0001→0013)
npx supabase start

# 4. Base fraîche avec migrations + seeds
npx supabase db reset

# 5. Comptes de recette E2E (optionnel, pour les tests de bout en bout)
pnpm --filter @iso/backend provision:e2e

# 6. Lancer les services
pnpm dev
```

---

## 5. Déploiement backend (node dist/server.js)

Le backend est une API Express compilée : `pnpm build` (`rm -rf dist && tsc`)
produit `apps/backend/dist/`, et **seul `dist/server.js` est lancé en production**,
derrière un process manager et un reverse proxy. (`pnpm typecheck` reste le
contrôle sans émission.) La CI construit l'artefact, vérifie qu'il démarre et
exécute toute la suite E2E contre lui.

```bash
cd apps/backend
pnpm install --frozen-lockfile
pnpm build            # tsc → dist/server.js
NODE_ENV=production
# systemd (exemple) :
#   ExecStart=/usr/bin/node dist/server.js
#   WorkingDirectory=/opt/qualidji/apps/backend
#   Environment="PORT=4000" "CORS_ORIGIN=https://app.qualidji.fr"
#   Environment="TRUST_PROXY=1"            # nombre de reverse proxys devant le backend
#   Environment="RATE_LIMIT_API=2000" "RATE_LIMIT_WINDOW_MS=600000"
#   Environment="SUPABASE_URL=https://<projet>.supabase.co"
#   Environment="SUPABASE_ANON_KEY=<anonne>"
#   Environment="SUPABASE_SERVICE_ROLE_KEY=<service_role>"
```

- **Port** : `PORT` (défaut 4000).
- **Reverse proxy** : définir `TRUST_PROXY` (voir §3). Sans lui, `req.ip` est
  l'adresse du proxy et **tous les utilisateurs partagent le même quota** de
  limitation de débit ; avec une valeur trop large, un client peut usurper son
  IP via `X-Forwarded-For`. `TRUST_PROXY=true` est refusé au démarrage.
- **Health** : `GET /health` → 200 (hors limitation de débit ; utilisé par les
  supervisors et les smoke tests).
- **Logs** : texte brut sur stdout/stderr (pas de JSON structuré) — à collecter
  via le journal système (journalctl) ou l'agent de logs de la plateforme.

---

## 6. Déploiement frontend (statique)

```bash
cd apps/frontend
pnpm build            # vite build → dist/
```

L'artifact `dist/` est une SPA classique (HTML + JS + assets + manifest + SW).
Hébergement possible : Cloudflare Pages / Netlify / Vercel / object storage
(S3/Cloudflare R2), **uniquement via une origine autorisée** par
`CORS_ORIGIN` côté backend.

Variables de build (le `.env` local prime sur le `.env.example` lors du build) :

| Variable | Sens | Exemple (CI local) |
|---|---|---|
| `VITE_SUPABASE_URL` | URL de la base | `https://<projet>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Clé anonne | `sb_publishable_…` |
| `VITE_API_URL` | URL de l'API | `http://localhost:4000/api/v1` |

Le service worker ne fait que du *shell* (pas de cache des API) : l'actualisation
consiste à redéployer `dist/` et à vider le cache du navigateur si nécessaire.

---

## 7. Migrations & seeds

| Action | Commande | Usage |
|---|---|---|
| Base locale fraîche | `npx supabase db reset` | réapplique 0001→0013 + seeds |
| Ajouter une migration | `supabase db insert-migration <nom>` puis commit | nouveau `supabase/migrations/YYYYMMDDHHMMSS_*.sql` |
| Synchroniser cloud | `npx supabase db push` | applique les migrations locales sur le projet cloud |
| Voir le state | `npx supabase db pull` | **écrit `supabase/migrations`** : faire un commit avant |
| Seeds | lancés automatiquement par `db reset` (cf. §4) | `supabase/seeds/0001_spec_seed.sql`, `0002_annex_n_matrix.sql` |

Règle d'or : **jamais de modifications manuelles de `supabase/migrations`**
entre deux releases ; toute correction se fait par nouvelle migration.

---

## 8. Sauvegarde & restauration

### 8.1 Archiver (local)

```bash
./scripts/db_backup.sh --tag v0.4.0 /chemin/vers/backups
```

L'archive `<dest>/v0.4.0-20261021-0822/` contient :
- `schema.sql` — schéma actuel (`supabase db dump --local`);
- `data.sql` — données actuellement (`supabase db dump --local --data-only`).

### 8.2 Restaurer (local)

```bash
./scripts/db_restore.sh <archive>
```

Procédure : `db reset` (base fraîche + seeds) → relecture de `data.sql` avec
`SET session_replication_role = replica` → vérification des comptages (tenants,
roles, workflows, requirements, auth.users).

### 8.3 Projet cloud (Supabase Management API)

Sur un projet distant, la restauration physique (PITR) est disponible via les
`supabase backups` (list/restore) mais reste une opération manuelle de l'OP.
La sauvegarde de référence reste le dépôt git des migrations + l'archive
`db_backup.sh`.


---

## 9. Exploitation courante

| Tâche | Commande |
|---|---|
| Revenir à une base vierge | `npx supabase db reset` |
| Comptes E2E (recette) | `pnpm --filter @iso/backend provision:e2e` |
| Supprimer les comptes de recette | `pnpm --filter @iso/backend cleanup:e2e` |
| Archiver | `./scripts/db_backup.sh` |
| Restaurer | `./scripts/db_restore.sh <archive>` |
| Audits internes / revues de direction | Pas de commande dédiée : API `/api/v1/audits` et `/api/v1/reviews`, interface « Audits internes » et « Revues direction » |
| Linter/typecheck | `pnpm -r lint && pnpm -r typecheck` |
| Tests | `pnpm --filter @iso/backend test` / `pnpm --filter @iso/frontend test` |

> **Audit interne (§9.2)** — Programme d'audits, constat (finding) avec réponse et vérification d'efficacité par personne distincte (§F.4). Flux : planifié → en cours → répondu → vérifié efficace ou réouvert.
>
> **Revue de direction (§9.3)** — Tenue conditionnelle exigeant entrées consolidées (depuis les données enregistrées §5.8) ET décisions. Statuts : brouillon → tenue (il n'existe pas d'état « close » pour une revue). Les entrées sont consolidées par le serveur (`/prefill`) et scellées par empreinte ; la tenue les revérifie. La tenue ne peut être effectuée que quand les deux conditions sont remplies.

---

## 10. Vérification post-déploiement

```bash
curl -sf http://localhost:4000/health          # backend up
curl -sf https://<frontend>/                    # frontend statique
pnpm --filter @iso/frontend test:e2e           # smoke Playwright (3/3)
# En CI : jobs checks + e2e (103 checks)
```

---

## 11. Rollback

- Base : `db reset` puis restauration de l'archive la plus récente
  (`db_restore.sh`).
- Frontend : remplacer `dist/` par l'archive de l'ancienne build
  (`git archive` / archive de build, pas de build locale).
- Backend : redémarrer l'ancien artefact (systemd `restart` + `rollback` optionnel
  via un symlink `current` ⇄ `previous`).

---

## 12. Sécurité

- **RSL** : toutes les tables métiers sont tenant-scoped ; seuls les rôles
  cessent les permissions listées dans `public.permissions` + `user_profiles.role`.
- **CORS** : `CORS_ORIGIN` accepte une liste CSV ; les requêtes sans `Origin`
  (tests, scripts) sont autorisées — désactivé en production si possible.
- **Rate limit** : 600 req/10 min/IP par défaut sur `/api/v1` (`RATE_LIMIT_API`
  configurable).
- **Secrets** : jamais commités ; rotation mensuelle recommandée pour
  `SUPABASE_SERVICE_ROLE_KEY` et `JWT_SECRET`.
