-- ============================================================================
-- Migration 0008: Nonconformities, CAPA, root cause analysis
-- ============================================================================
-- Domain G: Non-conformités et actions correctives/préventives
-- Tables: nonconformities, capa_actions, root_cause_analyses,
--         five_whys, ishikawa_diagrams, capa_verifications
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type nc_severity as enum ('minor', 'major', 'critical');
create type nc_status as enum ('open', 'under_investigation', 'capa_defined', 'capa_in_progress', 'capa_completed', 'verified_effective', 'closed', 'cancelled');
create type nc_source as enum ('internal_audit', 'external_audit', 'customer_complaint', 'process_deviation', 'self_assessment', 'anomaly_flag', 'management_review', 'other');
create type capa_type as enum ('corrective', 'preventive', 'improvement');
create type capa_status as enum ('planned', 'in_progress', 'completed', 'verified', 'ineffective', 'cancelled');
create type ishikawa_branch as enum ('man', 'machine', 'material', 'method', 'measurement', 'environment');

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.nonconformities (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nc_number text not null,         -- e.g. 'NC-2024-001'
  title text not null,
  description text not null,
  severity nc_severity not null,
  status nc_status not null default 'open',
  source nc_source not null default 'other',
  site_id uuid references public.sites(id) on delete set null,
  process text,                    -- e.g. 'Production', 'Purchases'
  requirement_id uuid references public.requirements(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  evidence_id uuid references public.evidence(id) on delete set null,
  anomaly_id uuid references public.anomaly_flags(id) on delete set null,
  detected_by uuid not null references auth.users(id),
  detected_at date not null default current_date,
  affected_products text[],
  affected_processes text[],
  immediate_action text,           -- containment / correction
  immediate_action_by uuid references auth.users(id),
  immediate_action_at date,
  assigned_to uuid references auth.users(id),  -- responsible for investigation
  due_date date,
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, nc_number)
);

create table public.root_cause_analyses (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nc_id uuid not null references public.nonconformities(id) on delete cascade,
  method text not null default '5why',  -- '5why', 'ishikawa', 'both'
  summary text,
  conducted_by uuid not null references auth.users(id),
  conducted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.five_whys (
  id uuid primary key default uuid_generate_v4(),
  rca_id uuid not null references public.root_cause_analyses(id) on delete cascade,
  step integer not null,           -- 1 to 5 (or more)
  question text not null,          -- "Why did X happen?"
  answer text not null,            -- "Because..."
  is_root_cause boolean not null default false,
  created_at timestamptz not null default now(),
  unique(rca_id, step)
);

create table public.ishikawa_diagrams (
  id uuid primary key default uuid_generate_v4(),
  rca_id uuid not null references public.root_cause_analyses(id) on delete cascade,
  branch ishikawa_branch not null,
  cause text not null,
  is_root_cause boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.capa_actions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nc_id uuid references public.nonconformities(id) on delete cascade,
  capa_number text not null,       -- e.g. 'CAPA-2024-001'
  type capa_type not null,
  title text not null,
  description text not null,
  status capa_status not null default 'planned',
  assigned_to uuid not null references auth.users(id),
  due_date date not null,
  completed_at timestamptz,
  effectiveness_criteria text not null,  -- how to verify it worked
  effectiveness_result text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  verification_notes text,
  linked_task_id uuid references public.tasks(id) on delete set null,  -- if CAPA generates a task
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, capa_number)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_nonconformities_tenant on public.nonconformities(tenant_id);
create index idx_nonconformities_status on public.nonconformities(status);
create index idx_nonconformities_severity on public.nonconformities(severity);
create index idx_nonconformities_assigned on public.nonconformities(assigned_to);
create index idx_root_cause_analyses_nc on public.root_cause_analyses(nc_id);
create index idx_five_whys_rca on public.five_whys(rca_id);
create index idx_ishikawa_rca on public.ishikawa_diagrams(rca_id);
create index idx_capa_actions_tenant on public.capa_actions(tenant_id);
create index idx_capa_actions_nc on public.capa_actions(nc_id);
create index idx_capa_actions_status on public.capa_actions(status);
create index idx_capa_actions_assigned on public.capa_actions(assigned_to);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.nonconformities enable row level security;
alter table public.root_cause_analyses enable row level security;
alter table public.five_whys enable row level security;
alter table public.ishikawa_diagrams enable row level security;
alter table public.capa_actions enable row level security;

-- Nonconformities: all tenant users can see; create/update by quality roles
create policy nonconformities_select on public.nonconformities
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy nonconformities_insert on public.nonconformities
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'internal_auditor', 'super_admin'])
  );

create policy nonconformities_update on public.nonconformities
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      detected_by = (select auth.uid())
      or assigned_to = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  )
  with check (tenant_id = public.current_tenant_id());

create policy nonconformities_delete on public.nonconformities
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Root cause analyses: same access as NC
create policy root_cause_analyses_select on public.root_cause_analyses
  for select to authenticated
  using (
    exists (
      select 1 from public.nonconformities nc
      where nc.id = root_cause_analyses.nc_id
        and nc.tenant_id = public.current_tenant_id()
    )
  );

create policy root_cause_analyses_insert on public.root_cause_analyses
  for insert to authenticated
  with check (
    exists (
      select 1 from public.nonconformities nc
      where nc.id = root_cause_analyses.nc_id
        and nc.tenant_id = public.current_tenant_id()
        and (
          nc.assigned_to = (select auth.uid())
          or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
        )
    )
  );

create policy root_cause_analyses_delete on public.root_cause_analyses
  for delete to authenticated
  using (
    exists (
      select 1 from public.nonconformities nc
      where nc.id = root_cause_analyses.nc_id
        and nc.tenant_id = public.current_tenant_id()
        and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  );

-- Five whys: accessible via RCA
create policy five_whys_select on public.five_whys
  for select to authenticated
  using (
    exists (
      select 1 from public.root_cause_analyses rca
      join public.nonconformities nc on nc.id = rca.nc_id
      where rca.id = five_whys.rca_id
        and nc.tenant_id = public.current_tenant_id()
    )
  );

create policy five_whys_insert on public.five_whys
  for insert to authenticated
  with check (
    exists (
      select 1 from public.root_cause_analyses rca
      join public.nonconformities nc on nc.id = rca.nc_id
      where rca.id = five_whys.rca_id
        and nc.tenant_id = public.current_tenant_id()
    )
  );

create policy five_whys_delete on public.five_whys
  for delete to authenticated
  using (
    exists (
      select 1 from public.root_cause_analyses rca
      join public.nonconformities nc on nc.id = rca.nc_id
      where rca.id = five_whys.rca_id
        and nc.tenant_id = public.current_tenant_id()
    )
  );

-- Ishikawa: same as five whys
create policy ishikawa_select on public.ishikawa_diagrams
  for select to authenticated
  using (
    exists (
      select 1 from public.root_cause_analyses rca
      join public.nonconformities nc on nc.id = rca.nc_id
      where rca.id = ishikawa_diagrams.rca_id
        and nc.tenant_id = public.current_tenant_id()
    )
  );

create policy ishikawa_insert on public.ishikawa_diagrams
  for insert to authenticated
  with check (
    exists (
      select 1 from public.root_cause_analyses rca
      join public.nonconformities nc on nc.id = rca.nc_id
      where rca.id = ishikawa_diagrams.rca_id
        and nc.tenant_id = public.current_tenant_id()
    )
  );

create policy ishikawa_delete on public.ishikawa_diagrams
  for delete to authenticated
  using (
    exists (
      select 1 from public.root_cause_analyses rca
      join public.nonconformities nc on nc.id = rca.nc_id
      where rca.id = ishikawa_diagrams.rca_id
        and nc.tenant_id = public.current_tenant_id()
    )
  );

-- CAPA actions: all tenant users can see; quality roles can manage
create policy capa_actions_select on public.capa_actions
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy capa_actions_insert on public.capa_actions
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy capa_actions_update on public.capa_actions
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      assigned_to = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  )
  with check (tenant_id = public.current_tenant_id());

create policy capa_actions_delete on public.capa_actions
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

create trigger trg_nonconformities_updated_at
  before update on public.nonconformities
  for each row execute function public.set_updated_at();

create trigger trg_capa_actions_updated_at
  before update on public.capa_actions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: Auto-generate NC number
-- ============================================================================

create or replace function public.generate_nc_number(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_year text;
  v_number text;
begin
  v_year := extract(year from now())::text;

  select count(*) + 1 into v_count
  from public.nonconformities
  where tenant_id = p_tenant_id
    and extract(year from detected_at) = extract(year from now());

  v_number := 'NC-' || v_year || '-' || lpad(v_count::text, 3, '0');

  return v_number;
end;
$$;

create or replace function public.generate_capa_number(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_year text;
  v_number text;
begin
  v_year := extract(year from now())::text;

  select count(*) + 1 into v_count
  from public.capa_actions
  where tenant_id = p_tenant_id
    and extract(year from created_at) = extract(year from now());

  v_number := 'CAPA-' || v_year || '-' || lpad(v_count::text, 3, '0');

  return v_number;
end;
$$;

-- ============================================================================
-- TRIGGER: Notify on NC creation
-- ============================================================================

create or replace function public.on_nc_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Notify quality manager
  perform public.create_notification(
    new.tenant_id,
    new.assigned_to,
    'anomaly_detected',
    'Nouvelle non-conformité: ' || new.nc_number,
    'Une non-conformité vous a été assignée: ' || new.title,
    '/tenant/nonconformities/' || new.id,
    'Voir la NC',
    'high'
  );

  return new;
end;
$$;

create trigger trg_on_nc_created
  after insert on public.nonconformities
  for each row
  execute function public.on_nc_created();

-- ============================================================================
-- TRIGGER: Notify on CAPA due date approaching
-- ============================================================================

create or replace function public.on_capa_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_notification(
    new.tenant_id,
    new.assigned_to,
    'task_due',
    'Nouvelle CAPA assignée: ' || new.capa_number,
    'Une action corrective/préventive vous a été assignée: ' || new.title,
    '/tenant/nonconformities/' || new.nc_id,
    'Voir la CAPA',
    'high'
  );

  return new;
end;
$$;

create trigger trg_on_capa_created
  after insert on public.capa_actions
  for each row
  execute function public.on_capa_created();
