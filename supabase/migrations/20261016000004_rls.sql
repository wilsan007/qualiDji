-- ============================================================================
-- Migration 0001 (4/4): RLS §7.3 — isolation tenant obligatoire
-- Référentiels workflow_definitions/actions/steps/templates : lecture
-- globale, écriture via backend service_role uniquement.
-- ============================================================================

alter table public.tenants enable row level security;
alter table public.user_profiles enable row level security;
alter table public.actions enable row level security;
alter table public.step_submissions enable row level security;
alter table public.ai_interventions enable row level security;
alter table public.evidence enable row level security;
alter table public.audit_log enable row level security;
alter table public.integrity_alerts enable row level security;
alter table public.sync_log enable row level security;
alter table public.nonconformities enable row level security;
alter table public.capas enable row level security;

create policy tenant_isolation_actions on public.actions for all using (
  tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
);

create policy employee_actions_select on public.actions for select using (
  tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
  and (
    assigned_to = auth.uid()
    or exists (
      select 1 from public.user_profiles
      where id = auth.uid()
        and role in ('quality_manager', 'site_manager', 'admin')
    )
  )
);

create policy tenant_isolation_submissions on public.step_submissions for all using (
  tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
);

create policy tenant_isolation_evidence_select on public.evidence for select using (
  exists (
    select 1 from public.actions
    where actions.id = evidence.action_id
      and actions.tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
  )
);

create policy tenant_isolation_evidence_write on public.evidence for insert with check (
  tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
);

-- 9) Privilèges table explicites (portables: indépendants des default
--    privileges du rôle qui applique les migrations). Un statement par rôle.
--    Les lignes restent contrôlées par les politiques RLS ci-dessus.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage on all sequences in schema public to authenticated;
grant usage on all sequences in schema public to anon;
grant usage on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on tables to anon;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage on sequences to authenticated;
alter default privileges in schema public grant usage on sequences to anon;
alter default privileges in schema public grant usage on sequences to service_role;
