-- ============================================================================
-- Migration 0016 : moteur d'exécution des actions (constat C4 de
-- docs/AUDIT_ANALYSE_APPROFONDIE.md)
--   Traçabilité des nouvelles transitions : qui a assigné l'action, qui l'a
--   approuvée ou rejetée, quand, avec quel commentaire. Les statuts existants
--   (assigned, in_progress, submitted, approved, blocked, closed) sont conservés.
--   Écritures exclusivement via le backend (service_role), cf. 0014.
-- Idempotent.
-- ============================================================================

alter table public.actions
  add column if not exists assigned_by uuid references auth.users (id),
  add column if not exists reviewed_by uuid references auth.users (id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_comment text;

create index if not exists actions_status_idx on public.actions (tenant_id, status);
