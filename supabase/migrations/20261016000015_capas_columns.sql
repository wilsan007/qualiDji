-- ============================================================================
-- Migration 0015 : colonnes CAPA manquantes (constat C6 de
-- docs/AUDIT_ANALYSE_APPROFONDIE.md)
--   POST /nonconformities/:id/capa insérait responsible, due_date et created_by,
--   absents de la table capas (0003) : toute création échouait en 400, et les
--   rapports (reports.ts) lisaient ces mêmes colonnes inexistantes.
--   - responsible : texte libre saisi dans le formulaire CAPA (aucun lien
--     utilisateur n'est exigé par l'interface actuelle)
--   - due_date    : échéance (date, sans heure)
--   - created_by  : auteur du plan, tracé comme pour nonconformities
-- Idempotent.
-- ============================================================================

alter table public.capas
  add column if not exists responsible text,
  add column if not exists due_date date,
  add column if not exists created_by uuid references auth.users (id);

create index if not exists capas_nonconformity_idx on public.capas (nonconformity_id);
