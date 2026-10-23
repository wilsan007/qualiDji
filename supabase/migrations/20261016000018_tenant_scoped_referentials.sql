-- ============================================================================
-- Migration 0018 : isolation des référentiels entre tenants (constat C5 de
-- docs/AUDIT_ANALYSE_APPROFONDIE.md)
--   Avant : la bibliothèque de workflows et le catalogue d'exigences étaient
--   GLOBAUX et modifiables par n'importe quel détenteur de workflow.approve /
--   workflow.edit_draft de n'importe quel tenant (déprécier ou supprimer
--   WF_CONTEXT_ANALYSIS pour tous, lister les brouillons des autres…).
--
--   workflow_definitions.tenant_id :
--     NULL      = workflow de la bibliothèque GLOBALE (seed, géré par la
--                 plateforme) : lisible par tous, jamais modifiable via l'API tenant ;
--     <tenant>  = workflow propre au tenant (création ou duplication d'un global).
--   requirement_assessments : les champs K.2 (responsable, contrôle logiciel,
--     preuve attendue, méthode de vérification) deviennent des surcharges PAR
--     TENANT ; le catalogue `requirements` n'est plus écrit par les tenants.
-- Idempotent.
-- ============================================================================

alter table public.workflow_definitions
  add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;
create index if not exists workflow_definitions_tenant_idx on public.workflow_definitions (tenant_id);

-- Rattrapage : les workflows créés AVANT cette migration par un utilisateur d'un tenant
-- appartiennent à ce tenant (le seed, sans auteur, reste dans la bibliothèque globale).
update public.workflow_definitions w
set tenant_id = p.tenant_id
from public.user_profiles p
where w.tenant_id is null and w.created_by is not null and w.created_by = p.id and p.tenant_id is not null;

-- Supprimer un tenant doit emporter ses workflows : les actions/étapes enfants suivent.
alter table public.workflow_actions drop constraint if exists workflow_actions_workflow_id_fkey;
alter table public.workflow_actions
  add constraint workflow_actions_workflow_id_fkey
  foreign key (workflow_id) references public.workflow_definitions (id) on delete cascade;

-- Lecture côté client : global publié OU workflow publié de SON tenant (les
-- brouillons passent par le backend, permission workflow.approve).
drop policy if exists workflow_definitions_published_select on public.workflow_definitions;
drop policy if exists workflow_definitions_visible_select on public.workflow_definitions;
create policy workflow_definitions_visible_select on public.workflow_definitions
  for select to authenticated using (
    status = 'published'
    and (
      tenant_id is null
      or tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
    )
  );
-- workflow_actions / workflow_steps : leurs politiques (0014) s'appuient sur la
-- visibilité de la définition parente (sous-requête soumise à cette RLS).

-- Surcharges K.2 par tenant
alter table public.requirement_assessments
  add column if not exists process_owner text,
  add column if not exists software_control text,
  add column if not exists objective_evidence text,
  add column if not exists verification_method text;
