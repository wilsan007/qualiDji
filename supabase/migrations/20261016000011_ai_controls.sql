-- ============================================================================
-- Migration 0011 : P3 — Contrôles IA (V5 §7.5 R5 « Traçabilité »)
--   - journal d'interaction enrichi : modèle, version du prompt, hashes
--     entrée/sortie, latence, résultat — exigés par R5
--   - fix : action_def_id (texte) ajouté — action_id reste la FK uuid des
--     instances d'actions ; le guidage porte sur les DÉFINITIONS
--     (workflow_actions, ids textes) et l'insert échouait silencieusement :
--     le journal n'avait jamais été écrit.
-- Idempotent.
-- ============================================================================

alter table public.ai_interventions
  add column if not exists action_def_id text,
  add column if not exists model text,
  add column if not exists prompt_version text,
  add column if not exists input_hash text,
  add column if not exists output_hash text,
  add column if not exists latency_ms integer,
  add column if not exists result_status text
    check (result_status in ('ok', 'degraded', 'unavailable', 'error', 'rejected_injection')),
  add column if not exists degraded boolean not null default false,
  add column if not exists ai_meta jsonb not null default '{}'::jsonb;

create index if not exists ai_interventions_action_def_idx
  on public.ai_interventions (action_def_id) where action_def_id is not null;

