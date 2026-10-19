# Compliance Execution Platform — Module ISO 9001 · IA Assistant Terrain

Spécification : `Specification_ISO9001_IA_Assistant_Terrain.docx` — Version 1.0 Août 2026
Référentiel : ISO 9001 (Édition 6, 2026 — FDIS approuvé) / ISO 9001:2015 (structure HLS, clauses 4 à 10)

## Principe fondamental

> L'IA ne génère PAS de workflows. Elle décompose, précise et guide l'exécution
> des workflows métier déjà définis par le responsable qualité.

## Priorité absolue

Implémenter d'abord le workflow `WF_CONTEXT_ANALYSIS` (Clause 4.1) avec son
action `ACT_CTX_001`, son guidage IA, et sa chaîne de preuve. Puis itérer
clause par clause. Ne jamais coder l'IA avant un workflow métier stable et testé.

## Stack (§7.1 spec)

- **frontend** : React 18+, TypeScript strict, Vite, React Router v6, Tailwind CSS,
  Zustand / React Query, React Hook Form + Zod, PWA + IndexedDB (dexie.js)
- **backend** : Node.js 20+, TypeScript, Express, Zod, Supabase Auth
- **database** : PostgreSQL 15+ hébergé sur Supabase — RLS obligatoire
- **storage** : Supabase Storage, buckets privés uniquement, signed URLs max 1h
- **ai** : interface `AIProvider` (OpenAI, Anthropic, ou local Ollama),
  fallback templates statiques si provider down

## Structure

```
apps/
  frontend/   # React + Vite + Tailwind + dexie (PWA terrain)
  backend/    # Express + Zod + Supabase (API v1)
supabase/
  migrations/ # SQL versionnées — tables spec §5-6 + RLS §7.3
  seeds/      # WF_CONTEXT_ANALYSIS + ACT_CTX_001 + prompts CTX_*
```

## Démarrage

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env   # même URL Supabase conservée
cp apps/frontend/.env.example apps/frontend/.env
pnpm dev
```

## Règle absolue (§1.1)

Le système ne reproduit pas le texte intégral protégé de la norme ISO.
Il stocke des identifiants, des mappings, des workflows métier et des preuves
d'exécution.
