-- ============================================================================
-- Migration 0008 : Module B — Bibliothèque de workflows (V5 §5.2 / §6.1 / §6.3)
-- Cycle de publication : brouillon → revue → approbation → publication.
-- Un workflow publié ne peut pas être édité directement : toute modification
-- passe par une copie versionnée (duplicate + change_reason), comme exigé §5.2.
-- Les lignes existantes (seed) deviennent status='published' si actives,
-- sinon 'deprecated'. Idempotent.
-- ============================================================================

alter table public.workflow_definitions
  add column if not exists status text not null default 'published'
    check (status in ('draft', 'in_review', 'published', 'deprecated')),
  add column if not exists change_reason text,
  add column if not exists review_comment text,
  add column if not exists effective_from timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists updated_at timestamptz not null default now();

-- Alignement rétroactif : les définitions seedées actives = publiées,
-- les inactives = dépréciées (la colonne is_active reste la source
-- d'activation à l'exécution pour ne pas casser les routes existantes).
update public.workflow_definitions
set status = case when is_active then 'published' else 'deprecated' end
where (not is_active and status = 'published')
   or (is_active and status = 'deprecated');

-- Requiert une table tenants pour la FK éventuelle des surcouches futures — non
-- ajoutée ici : les workflows de la bibliothèque restent partagés (tenant_id null)
-- comme aujourd'hui. Les écritures passent exclusivement par le backend
-- (service_role + requirePermission V5 §3.3) ; la RLS de lecture 0004 inchangée.
