-- ============================================================================
-- Migration 0015: HACCP — Flow diagrams, hazard analysis, HACCP plan
-- ============================================================================
-- Sprint 18: HACCP plan (Codex 12 steps)
-- Tables: flow_diagrams, flow_steps, hazard_analyses, hazards,
--         control_measures, ccp_determinations, haccp_plans
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type flow_step_type as enum (
  'receiving', 'storage', 'preparation', 'processing',
  'cooking', 'cooling', 'packaging', 'labeling',
  'dispatch', 'transport', 'other'
);

create type hazard_category as enum (
  'biological', 'chemical', 'physical', 'allergen', 'radiological'
);

create type hazard_source as enum (
  'raw_material', 'process', 'environment', 'personnel', 'equipment', 'packaging'
);

create type control_point_type as enum ('ccp', 'oprp', 'prp');

create type monitoring_method as enum (
  'visual', 'temperature', 'time', 'measurement', 'chemical_test',
  'microbiological', 'metal_detection', 'weight', 'other'
);

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.flow_diagrams (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  name text not null,
  version integer not null default 1,
  description text,
  -- React Flow JSON structure
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  is_verified boolean not null default false,    -- verified on site
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.flow_steps (
  id uuid primary key default uuid_generate_v4(),
  flow_diagram_id uuid not null references public.flow_diagrams(id) on delete cascade,
  step_number integer not null,
  name text not null,
  type flow_step_type not null default 'other',
  description text,
  inputs text,                    -- inputs for this step
  outputs text,                   -- outputs from this step
  -- Position in React Flow
  position_x numeric not null default 0,
  position_y numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hazards (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  category hazard_category not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.hazard_analyses (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  flow_diagram_id uuid not null references public.flow_diagrams(id) on delete cascade,
  flow_step_id uuid references public.flow_steps(id) on delete cascade,
  hazard_id uuid references public.hazards(id) on delete set null,
  hazard_name text not null,       -- denormalized for convenience
  hazard_category hazard_category not null,
  hazard_source hazard_source,
  -- Risk assessment
  likelihood integer not null default 1 check (likelihood between 1 and 5),
  severity integer not null default 1 check (severity between 1 and 5),
  risk_score integer generated always as (likelihood * severity) stored,
  -- Control measures
  control_measure text,
  control_point_type control_point_type,    -- determined by Codex decision tree
  is_significant boolean not null default false,
  justification text,
  -- Codex decision tree answers (Q1-Q4)
  decision_q1 boolean,             -- Is control measure at this step?
  decision_q2 boolean,             -- Could hazard reach unacceptable level?
  decision_q3 boolean,             -- Could contamination increase to unacceptable?
  decision_q4 boolean,             -- Will subsequent step eliminate/reduce hazard?
  analyzed_by uuid references auth.users(id) on delete set null,
  analyzed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.haccp_plans (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  flow_diagram_id uuid not null references public.flow_diagrams(id) on delete cascade,
  name text not null,
  version integer not null default 1,
  status text not null default 'draft',    -- draft, under_review, approved, active
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.control_points (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  haccp_plan_id uuid not null references public.haccp_plans(id) on delete cascade,
  hazard_analysis_id uuid references public.hazard_analyses(id) on delete set null,
  flow_step_id uuid references public.flow_steps(id) on delete set null,
  code text not null,              -- CCP-01, oPRP-01
  type control_point_type not null,
  hazard text not null,
  control_measure text not null,
  -- Critical limits
  critical_limit_text text not null,    -- e.g. "Temperature ≥ 75°C for 2 min"
  critical_limit_min numeric,
  critical_limit_max numeric,
  critical_limit_unit text,        -- °C, minutes, ppm, etc.
  -- Monitoring
  monitoring_method monitoring_method not null default 'visual',
  monitoring_frequency text not null,    -- e.g. "Every 2 hours", "Continuous"
  monitoring_responsible_id uuid references auth.users(id) on delete set null,
  -- Corrective actions
  corrective_action text not null,  -- what to do when limit exceeded
  disposition text,                -- what to do with the product
  -- Verification
  verification_procedure text,
  verification_frequency text,
  -- Records
  record_reference text,           -- form/code reference
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, code)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_flow_diagrams_tenant on public.flow_diagrams(tenant_id);
create index idx_flow_diagrams_product on public.flow_diagrams(product_id);
create index idx_flow_steps_diagram on public.flow_steps(flow_diagram_id);
create index idx_hazards_tenant on public.hazards(tenant_id);
create index idx_hazard_analyses_tenant on public.hazard_analyses(tenant_id);
create index idx_hazard_analyses_diagram on public.hazard_analyses(flow_diagram_id);
create index idx_hazard_analyses_step on public.hazard_analyses(flow_step_id);
create index idx_haccp_plans_tenant on public.haccp_plans(tenant_id);
create index idx_control_points_tenant on public.control_points(tenant_id);
create index idx_control_points_plan on public.control_points(haccp_plan_id);
create index idx_control_points_type on public.control_points(type);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.flow_diagrams enable row level security;
alter table public.flow_steps enable row level security;
alter table public.hazards enable row level security;
alter table public.hazard_analyses enable row level security;
alter table public.haccp_plans enable row level security;
alter table public.control_points enable row level security;

-- All tables are tenant-scoped with quality role management
create policy flow_diagrams_select on public.flow_diagrams
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy flow_diagrams_insert on public.flow_diagrams
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy flow_diagrams_update on public.flow_diagrams
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy flow_diagrams_delete on public.flow_diagrams
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Flow steps: via diagram access
create policy flow_steps_select on public.flow_steps
  for select to authenticated
  using (
    exists (
      select 1 from public.flow_diagrams fd
      where fd.id = flow_steps.flow_diagram_id
        and fd.tenant_id = public.current_tenant_id()
    )
  );

create policy flow_steps_insert on public.flow_steps
  for insert to authenticated
  with check (
    exists (
      select 1 from public.flow_diagrams fd
      where fd.id = flow_steps.flow_diagram_id
        and fd.tenant_id = public.current_tenant_id()
        and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
    )
  );

create policy flow_steps_update on public.flow_steps
  for update to authenticated
  using (
    exists (
      select 1 from public.flow_diagrams fd
      where fd.id = flow_steps.flow_diagram_id
        and fd.tenant_id = public.current_tenant_id()
    )
  );

create policy flow_steps_delete on public.flow_steps
  for delete to authenticated
  using (
    exists (
      select 1 from public.flow_diagrams fd
      where fd.id = flow_steps.flow_diagram_id
        and fd.tenant_id = public.current_tenant_id()
        and public.has_role(array['tenant_admin', 'super_admin'])
    )
  );

-- Hazards: tenant-scoped
create policy hazards_select on public.hazards
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy hazards_insert on public.hazards
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy hazards_update on public.hazards
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy hazards_delete on public.hazards
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Hazard analyses: tenant-scoped
create policy hazard_analyses_select on public.hazard_analyses
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy hazard_analyses_insert on public.hazard_analyses
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy hazard_analyses_update on public.hazard_analyses
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy hazard_analyses_delete on public.hazard_analyses
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- HACCP plans: tenant-scoped
create policy haccp_plans_select on public.haccp_plans
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy haccp_plans_insert on public.haccp_plans
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy haccp_plans_update on public.haccp_plans
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy haccp_plans_delete on public.haccp_plans
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Control points: tenant-scoped
create policy control_points_select on public.control_points
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy control_points_insert on public.control_points
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy control_points_update on public.control_points
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy control_points_delete on public.control_points
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

create trigger trg_flow_diagrams_updated_at
  before update on public.flow_diagrams
  for each row execute function public.set_updated_at();

create trigger trg_flow_steps_updated_at
  before update on public.flow_steps
  for each row execute function public.set_updated_at();

create trigger trg_hazard_analyses_updated_at
  before update on public.hazard_analyses
  for each row execute function public.set_updated_at();

create trigger trg_haccp_plans_updated_at
  before update on public.haccp_plans
  for each row execute function public.set_updated_at();

create trigger trg_control_points_updated_at
  before update on public.control_points
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: Auto-generate task definitions from control points
-- ============================================================================

create or replace function public.generate_monitoring_tasks(p_control_point_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cp record;
  v_task_id uuid;
  v_tenant_id uuid;
begin
  select * into v_cp from public.control_points where id = p_control_point_id;
  if not found then return null; end if;

  v_tenant_id := v_cp.tenant_id;

  -- Create a task for monitoring this control point
  insert into public.tasks (
    tenant_id,
    title,
    description,
    assignee_id,
    due_date,
    priority,
    status,
    evidence_level_required
  )
  values (
    v_tenant_id,
    'Surveillance: ' || v_cp.code || ' - ' || v_cp.hazard,
    'Méthode: ' || v_cp.monitoring_method::text || E'\nFréquence: ' || v_cp.monitoring_frequency ||
    E'\nLimite critique: ' || v_cp.critical_limit_text ||
    E'\nAction corrective: ' || coalesce(v_cp.corrective_action, 'N/A'),
    v_cp.monitoring_responsible_id,
    now() + interval '1 day',
    'high',
    'pending',
    4  -- N4 for CCP monitoring (photo + verification)
  )
  returning id into v_task_id;

  return v_task_id;
end;
$$;

-- ============================================================================
-- TRIGGER: Create monitoring task when CCP is created
-- ============================================================================

create or replace function public.on_control_point_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'ccp' and (old is null or old.type != 'ccp') then
    -- Generate initial monitoring task
    perform public.generate_monitoring_tasks(new.id);
  end if;
  return new;
end;
$$;

create trigger trg_on_control_point_created
  after insert on public.control_points
  for each row
  execute function public.on_control_point_created();
