-- ============================================================================
-- Migration 0010: Context, leadership, processes, risks, objectives/KPIs
-- ============================================================================
-- Sprint 13: ISO 9001 chapters 4-6
-- Tables: swot_analyses, swot_items, interested_parties, processes,
--         quality_policy, risks, objectives, kpis, kpi_values
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type swot_category as enum ('strength', 'weakness', 'opportunity', 'threat');
create type risk_type as enum ('risk', 'opportunity');
create type risk_treatment as enum ('avoid', 'mitigate', 'transfer', 'accept', 'exploit', 'share', 'enhance');
create type risk_status as enum ('identified', 'under_evaluation', 'treated', 'monitored', 'closed');
create type objective_status as enum ('active', 'achieved', 'missed', 'cancelled');
create type kpi_frequency as enum ('daily', 'weekly', 'monthly', 'quarterly', 'yearly');

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.swot_analyses (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  period text,                     -- e.g. '2024', 'Q1 2024'
  context text,                    -- description of the analysis context
  conducted_by uuid not null references auth.users(id),
  conducted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.swot_items (
  id uuid primary key default uuid_generate_v4(),
  swot_id uuid not null references public.swot_analyses(id) on delete cascade,
  category swot_category not null,
  description text not null,
  impact text,                     -- potential impact on QMS
  linked_risk_id uuid,             -- link to risks table (set later)
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.interested_parties (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,              -- e.g. 'Customers', 'Regulators', 'Employees'
  category text not null,          -- 'internal', 'external'
  needs text not null,             -- what they need/expect
  expectations text,               -- more detailed expectations
  influence text,                  -- low, medium, high
  monitoring_method text,          -- how we monitor their satisfaction
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.processes (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,              -- e.g. 'P1', 'P2'
  type text not null default 'operational',  -- 'management', 'operational', 'support'
  owner_id uuid references auth.users(id) on delete set null,
  description text,
  inputs text[],
  outputs text[],
  suppliers text,                  -- who provides inputs
  customers text,                  -- who receives outputs
  interactions text[],             -- codes of other processes
  is_core boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, code)
);

create table public.quality_policy (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  version text not null,
  content text not null,           -- the policy text
  content_en text,
  content_ar text,
  content_so text,
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  communication_method text[],    -- how it was communicated
  communication_evidence text,    -- proof of communication
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.risks (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_id uuid references public.processes(id) on delete set null,
  code text not null,              -- e.g. 'R-001', 'O-001'
  type risk_type not null,
  description text not null,
  cause text,
  consequence text,
  severity integer not null default 3 check (severity between 1 and 5),
  likelihood integer not null default 3 check (likelihood between 1 and 5),
  detectability integer not null default 3 check (detectability between 1 and 5),
  score integer generated always as (severity * likelihood * detectability) stored,
  treatment risk_treatment,
  treatment_action text,           -- what action is taken
  treatment_owner_id uuid references auth.users(id) on delete set null,
  treatment_due_date date,
  status risk_status not null default 'identified',
  last_reviewed_at date,
  next_review_date date,           -- when this risk should be reviewed
  linked_objective_id uuid,        -- FK set below after objectives
  linked_nc_id uuid references public.nonconformities(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, code)
);

create table public.objectives (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_id uuid references public.processes(id) on delete set null,
  code text not null,              -- e.g. 'OBJ-001'
  title text not null,
  description text not null,
  smart_criteria text,             -- Specific, Measurable, Achievable, Relevant, Time-bound
  baseline numeric,                -- starting value
  target numeric not null,         -- target value
  current_value numeric,           -- current progress
  unit text,                       -- '%', 'count', 'days', etc.
  direction text not null default 'increase',  -- 'increase' or 'decrease'
  start_date date not null,
  due_date date not null,
  status objective_status not null default 'active',
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, code)
);

-- Set FK from risks to objectives
alter table public.risks
  add constraint risks_linked_objective_fk
  foreign key (linked_objective_id) references public.objectives(id) on delete set null;

create table public.kpis (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  objective_id uuid references public.objectives(id) on delete cascade,
  process_id uuid references public.processes(id) on delete set null,
  name text not null,
  code text not null,
  description text,
  formula text,                    -- how it's calculated
  unit text not null,
  frequency kpi_frequency not null default 'monthly',
  target numeric,
  minimum_threshold numeric,       -- alert if below
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, code)
);

create table public.kpi_values (
  id uuid primary key default uuid_generate_v4(),
  kpi_id uuid not null references public.kpis(id) on delete cascade,
  value numeric not null,
  period_start date not null,
  period_end date not null,
  recorded_by uuid not null references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  unique(kpi_id, period_start)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_swot_analyses_tenant on public.swot_analyses(tenant_id);
create index idx_swot_items_swot on public.swot_items(swot_id);
create index idx_interested_parties_tenant on public.interested_parties(tenant_id);
create index idx_processes_tenant on public.processes(tenant_id);
create index idx_processes_owner on public.processes(owner_id);
create index idx_quality_policy_tenant on public.quality_policy(tenant_id);
create index idx_risks_tenant on public.risks(tenant_id);
create index idx_risks_process on public.risks(process_id);
create index idx_risks_status on public.risks(status);
create index idx_risks_next_review on public.risks(next_review_date);
create index idx_objectives_tenant on public.objectives(tenant_id);
create index idx_objectives_status on public.objectives(status);
create index idx_objectives_owner on public.objectives(owner_id);
create index idx_kpis_tenant on public.kpis(tenant_id);
create index idx_kpis_objective on public.kpis(objective_id);
create index idx_kpi_values_kpi on public.kpi_values(kpi_id);
create index idx_kpi_values_period on public.kpi_values(period_start);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.swot_analyses enable row level security;
alter table public.swot_items enable row level security;
alter table public.interested_parties enable row level security;
alter table public.processes enable row level security;
alter table public.quality_policy enable row level security;
alter table public.risks enable row level security;
alter table public.objectives enable row level security;
alter table public.kpis enable row level security;
alter table public.kpi_values enable row level security;

-- SWOT: all tenant users can see; quality roles manage
create policy swot_select on public.swot_analyses
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy swot_insert on public.swot_analyses
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'director', 'super_admin'])
  );

create policy swot_update on public.swot_analyses
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'director', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy swot_delete on public.swot_analyses
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- SWOT items: via SWOT access
create policy swot_items_select on public.swot_items
  for select to authenticated
  using (
    exists (
      select 1 from public.swot_analyses s
      where s.id = swot_items.swot_id
        and s.tenant_id = public.current_tenant_id()
    )
  );

create policy swot_items_insert on public.swot_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.swot_analyses s
      where s.id = swot_items.swot_id
        and s.tenant_id = public.current_tenant_id()
    )
  );

create policy swot_items_update on public.swot_items
  for update to authenticated
  using (
    exists (
      select 1 from public.swot_analyses s
      where s.id = swot_items.swot_id
        and s.tenant_id = public.current_tenant_id()
    )
  );

create policy swot_items_delete on public.swot_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.swot_analyses s
      where s.id = swot_items.swot_id
        and s.tenant_id = public.current_tenant_id()
    )
  );

-- Interested parties: all can see; quality roles manage
create policy interested_parties_select on public.interested_parties
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy interested_parties_insert on public.interested_parties
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'director', 'super_admin'])
  );

create policy interested_parties_update on public.interested_parties
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'director', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy interested_parties_delete on public.interested_parties
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Processes: all can see; quality roles manage
create policy processes_select on public.processes
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy processes_insert on public.processes
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy processes_update on public.processes
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      owner_id = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  )
  with check (tenant_id = public.current_tenant_id());

create policy processes_delete on public.processes
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Quality policy: all can see; directors and admins manage
create policy quality_policy_select on public.quality_policy
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy quality_policy_insert on public.quality_policy
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'director', 'super_admin'])
  );

create policy quality_policy_update on public.quality_policy
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'director', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy quality_policy_delete on public.quality_policy
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Risks: all can see; quality roles and process owners manage
create policy risks_select on public.risks
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy risks_insert on public.risks
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'director', 'super_admin'])
  );

create policy risks_update on public.risks
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      treatment_owner_id = (select auth.uid())
      or created_by = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  )
  with check (tenant_id = public.current_tenant_id());

create policy risks_delete on public.risks
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Objectives: all can see; quality roles and process owners manage
create policy objectives_select on public.objectives
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy objectives_insert on public.objectives
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'director', 'super_admin'])
  );

create policy objectives_update on public.objectives
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      owner_id = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  )
  with check (tenant_id = public.current_tenant_id());

create policy objectives_delete on public.objectives
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- KPIs: all can see; quality roles manage
create policy kpis_select on public.kpis
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy kpis_insert on public.kpis
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy kpis_update on public.kpis
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy kpis_delete on public.kpis
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- KPI values: all can see; quality roles and owners record
create policy kpi_values_select on public.kpi_values
  for select to authenticated
  using (
    exists (
      select 1 from public.kpis k
      where k.id = kpi_values.kpi_id
        and k.tenant_id = public.current_tenant_id()
    )
  );

create policy kpi_values_insert on public.kpi_values
  for insert to authenticated
  with check (
    exists (
      select 1 from public.kpis k
      where k.id = kpi_values.kpi_id
        and k.tenant_id = public.current_tenant_id()
        and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'operator', 'super_admin'])
    )
  );

create policy kpi_values_delete on public.kpi_values
  for delete to authenticated
  using (
    exists (
      select 1 from public.kpis k
      where k.id = kpi_values.kpi_id
        and k.tenant_id = public.current_tenant_id()
        and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  );

-- ============================================================================
-- TRIGGERS: updated_at
-- ============================================================================

create trigger trg_swot_analyses_updated_at
  before update on public.swot_analyses
  for each row execute function public.set_updated_at();

create trigger trg_interested_parties_updated_at
  before update on public.interested_parties
  for each row execute function public.set_updated_at();

create trigger trg_processes_updated_at
  before update on public.processes
  for each row execute function public.set_updated_at();

create trigger trg_risks_updated_at
  before update on public.risks
  for each row execute function public.set_updated_at();

create trigger trg_objectives_updated_at
  before update on public.objectives
  for each row execute function public.set_updated_at();

create trigger trg_kpis_updated_at
  before update on public.kpis
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: Generate risk code
-- ============================================================================

create or replace function public.generate_risk_code(p_tenant_id uuid, p_type risk_type)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_prefix text;
begin
  v_prefix := case when p_type = 'risk' then 'R' else 'O' end;

  select count(*) + 1 into v_count
  from public.risks
  where tenant_id = p_tenant_id
    and type = p_type;

  return v_prefix || '-' || lpad(v_count::text, 3, '0');
end;
$$;

create or replace function public.generate_objective_code(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) + 1 into v_count
  from public.objectives
  where tenant_id = p_tenant_id;

  return 'OBJ-' || lpad(v_count::text, 3, '0');
end;
$$;

-- ============================================================================
-- TRIGGER: Notify when risk review is overdue
-- ============================================================================

create or replace function public.check_overdue_risk_reviews()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id, tenant_id, treatment_owner_id, code, description
    from public.risks
    where next_review_date < current_date
      and status not in ('closed')
  loop
    perform public.create_notification(
      r.tenant_id,
      r.treatment_owner_id,
      'review_due',
      'Revue de risque en retard: ' || r.code,
      'La revue de risque est en retard: ' || r.description,
      '/tenant/risks/' || r.id,
      'Voir le risque',
      'high'
    );
  end loop;
end;
$$;

-- ============================================================================
-- TRIGGER: Notify on risk creation
-- ============================================================================

create or replace function public.on_risk_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.treatment_owner_id is not null then
    perform public.create_notification(
      new.tenant_id,
      new.treatment_owner_id,
      'system',
      'Nouveau risque assigné: ' || new.code,
      'Un risque/opportunité vous a été assigné: ' || new.description,
      '/tenant/risks/' || new.id,
      'Voir le risque',
      'normal'
    );
  end if;

  return new;
end;
$$;

create trigger trg_on_risk_created
  after insert on public.risks
  for each row
  execute function public.on_risk_created();

-- ============================================================================
-- TRIGGER: Notify on objective assignment
-- ============================================================================

create or replace function public.on_objective_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_notification(
    new.tenant_id,
    new.owner_id,
    'system',
    'Nouvel objectif assigné: ' || new.code,
    'Un objectif qualité vous a été assigné: ' || new.title,
    '/tenant/objectives/' || new.id,
    'Voir l''objectif',
    'high'
  );

  return new;
end;
$$;

create trigger trg_on_objective_created
  after insert on public.objectives
  for each row
  execute function public.on_objective_created();
