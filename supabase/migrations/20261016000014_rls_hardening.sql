-- ============================================================================
-- Migration 0014 : durcissement RLS / privilèges (constats C1 et C2 de
-- docs/AUDIT_ANALYSE_APPROFONDIE.md)
--
--   C1 : workflow_definitions, workflow_actions, workflow_steps,
--        ai_prompt_templates et security_alerts n'avaient pas de RLS alors que
--        anon/authenticated avaient INSERT/UPDATE/DELETE (0004 + privilèges par
--        défaut de la plateforme) : la clé publique suffisait à les réécrire.
--   C2 : les politiques FOR ALL (tenant seul) sur actions et step_submissions,
--        et la politique INSERT sur evidence, laissaient n'importe quel membre
--        du tenant (même `reader`) écrire en contournant le RBAC d'Express ;
--        employee_actions_select, permissive, était neutralisée par le FOR ALL.
--
-- Principe retenu : le navigateur ne fait JAMAIS d'écriture directe. Toutes les
-- écritures passent par le backend (service_role, requirePermission). Le client
-- (authenticated) ne garde que le SELECT, borné par la RLS ; anon n'a plus
-- aucun droit sur public. Le frontend ne lit directement que user_profiles
-- (propre ligne), le backend relit user_profiles avec le jeton utilisateur.
-- Idempotent.
-- ============================================================================

-- 1) Privilèges de table (C1 + défense en profondeur sur toutes les tables) ---
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
-- service_role (backend) conserve ses droits complets : non touché.

revoke all on all sequences in schema public from anon;
revoke all on all sequences in schema public from authenticated;

-- 2) Privilèges par défaut : les tables FUTURES ne doivent plus être ouvertes --
--    à anon/authenticated (la plateforme y accorde ALL par défaut). Chaque
--    nouvelle migration doit désormais accorder explicitement SELECT (+ RLS).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
do $$
begin
  alter default privileges for role supabase_admin in schema public
    revoke all on tables from anon, authenticated;
  alter default privileges for role supabase_admin in schema public
    revoke all on sequences from anon, authenticated;
exception when insufficient_privilege then
  raise notice 'privilèges par défaut de supabase_admin non modifiables avec ce rôle — à traiter via la console';
end $$;

-- 3) RLS sur les référentiels (C1) --------------------------------------------
alter table public.workflow_definitions enable row level security;
alter table public.workflow_actions enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.ai_prompt_templates enable row level security;
alter table public.security_alerts enable row level security;

-- Bibliothèque : seules les définitions publiées sont lisibles côté client
-- (les brouillons passent par le backend, permission workflow.approve).
drop policy if exists workflow_definitions_published_select on public.workflow_definitions;
create policy workflow_definitions_published_select on public.workflow_definitions
  for select to authenticated using (status = 'published');

drop policy if exists workflow_actions_published_select on public.workflow_actions;
create policy workflow_actions_published_select on public.workflow_actions
  for select to authenticated using (
    exists (select 1 from public.workflow_definitions d where d.id = workflow_actions.workflow_id)
  );

drop policy if exists workflow_steps_published_select on public.workflow_steps;
create policy workflow_steps_published_select on public.workflow_steps
  for select to authenticated using (
    exists (select 1 from public.workflow_actions a where a.id = workflow_steps.action_id)
  );

-- ai_prompt_templates et security_alerts : RLS activée SANS politique =
-- inaccessibles au client ; seul le backend (service_role) y accède.

-- 4) Exécution : lecture seule côté client (C2) --------------------------------
drop policy if exists tenant_isolation_actions on public.actions;
drop policy if exists employee_actions_select on public.actions;
create policy actions_select on public.actions
  for select to authenticated using (
    tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
    and (
      assigned_to = auth.uid()
      or exists (
        select 1 from public.user_profiles
        where id = auth.uid()
          -- Vue exhaustive du tenant : détenteurs de action.assign (0006) + tenant_admin
          and role in ('tenant_admin', 'quality_manager', 'site_manager',
                       'department_manager', 'consultant')
      )
    )
  );

drop policy if exists tenant_isolation_submissions on public.step_submissions;
drop policy if exists step_submissions_select on public.step_submissions;
create policy step_submissions_select on public.step_submissions
  for select to authenticated using (
    tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
    -- hérite de la visibilité de l'action parente (actions_select)
    and exists (select 1 from public.actions a where a.id = step_submissions.action_id)
  );

-- Preuves : plus aucune insertion directe (captured_by, checksum et chemin ne
-- doivent pas être choisis par le client) ; la lecture reste bornée au tenant.
drop policy if exists tenant_isolation_evidence_write on public.evidence;

-- 5) Garde-fou : la migration échoue si l'état attendu n'est pas atteint -------
do $$
declare
  bad text;
begin
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if bad is not null then
    raise exception '0014 : tables public sans RLS : %', bad;
  end if;

  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      or has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE'));
  if bad is not null then
    raise exception '0014 : privilèges résiduels anon/authenticated sur : %', bad;
  end if;
end $$;
