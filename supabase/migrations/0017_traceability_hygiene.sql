-- ============================================================================
-- Migration 0017: Traceability, recall simulation, hygiene/cleaning
-- ============================================================================
-- Sprint 20: Traçabilité et hygiène
-- Tables: lots, lot_movements, recall_simulations, recall_results,
--         cleaning_plans, cleaning_tasks, pest_control_records,
--         emergency_plans, emergency_drills
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type lot_status as enum ('received', 'in_storage', 'in_process', 'finished', 'shipped', 'quarantine', 'rejected', 'recalled');

create type movement_type as enum ('receive', 'transfer_in', 'transfer_out', 'consume', 'produce', 'ship', 'dispose', 'return', 'adjust');

create type recall_status as enum ('initiated', 'in_progress', 'completed', 'cancelled');

create type cleaning_frequency as enum ('daily', 'weekly', 'monthly', 'quarterly', 'after_use', 'as_needed');

create type cleaning_status as enum ('pending', 'in_progress', 'completed', 'verified', 'overdue');

create type pest_control_type as enum ('inspection', 'treatment', 'monitoring', 'follow_up');

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.lots (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  lot_number text not null,
  -- Source
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_lot text,              -- supplier's lot number
  -- Quantities
  quantity_received numeric not null default 0,
  quantity_current numeric not null default 0,
  unit text not null default 'kg',
  -- Dates
  received_date date not null default current_date,
  production_date date,
  expiry_date date,
  -- Status
  status lot_status not null default 'received',
  -- Storage
  location text,                  -- storage location
  -- Additional info
  certificate_of_analysis text,   -- URL or reference
  temperature_at_receipt numeric, -- °C at receipt
  is_blocked boolean not null default false,
  blocked_reason text,
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, lot_number)
);

create table public.lot_movements (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lot_id uuid not null references public.lots(id) on delete cascade,
  movement_type movement_type not null,
  quantity numeric not null,
  unit text not null default 'kg',
  -- Related lot (e.g., consumed to produce)
  related_lot_id uuid references public.lots(id) on delete set null,
  -- Location
  from_location text,
  to_location text,
  -- Who and when
  performed_by uuid not null references auth.users(id) on delete cascade,
  performed_at timestamptz not null default now(),
  notes text,
  -- Evidence
  document_url text,
  created_at timestamptz not null default now()
);

create table public.recall_simulations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  scenario text not null,          -- description of the simulated issue
  start_lot_id uuid not null references public.lots(id) on delete cascade,
  status recall_status not null default 'initiated',
  initiated_by uuid not null references auth.users(id) on delete cascade,
  initiated_at timestamptz not null default now(),
  completed_at timestamptz,
  -- Results
  total_lots_found integer,
  total_quantity_found numeric,
  time_to_complete_minutes integer,  -- time to trace all lots
  success_rate numeric,              -- percentage of lots found
  -- Report
  report_url text,
  lessons_learned text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recall_results (
  id uuid primary key default uuid_generate_v4(),
  recall_simulation_id uuid not null references public.recall_simulations(id) on delete cascade,
  lot_id uuid not null references public.lots(id) on delete cascade,
  found boolean not null default false,
  found_at timestamptz,
  current_location text,
  current_quantity numeric,
  current_status lot_status,
  -- Trace direction
  trace_direction text not null,   -- 'upstream' or 'downstream'
  -- Path
  trace_path jsonb not null default '[]'::jsonb,  -- array of movement IDs
  created_at timestamptz not null default now()
);

create table public.cleaning_plans (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,              -- e.g. 'CLEAN-01'
  area text,                       -- area to be cleaned
  equipment text,                  -- equipment to be cleaned
  frequency cleaning_frequency not null default 'daily',
  method text not null,            -- cleaning method
  chemicals text,                  -- chemicals used
  safety_precautions text,
  responsible_id uuid references auth.users(id) on delete set null,
  verification_method text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, code)
);

create table public.cleaning_tasks (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cleaning_plan_id uuid not null references public.cleaning_plans(id) on delete cascade,
  scheduled_date date not null,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  status cleaning_status not null default 'pending',
  -- Verification
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  verification_notes text,
  -- Evidence
  photo_before_url text,
  photo_after_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pest_control_records (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type pest_control_type not null,
  conducted_date date not null default current_date,
  conducted_by text,              -- internal or external pest control operator
  areas_inspected text,
  findings text,
  action_taken text,
  follow_up_required boolean not null default false,
  follow_up_date date,
  -- Bait station monitoring
  bait_stations_checked integer,
  bait_stations_with_activity integer,
  photo_url text,
  created_at timestamptz not null default now()
);

create table public.emergency_plans (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  emergency_type text not null,    -- 'fire', 'contamination', 'power_outage', 'recall', 'allergen'
  description text,
  procedures text not null,
  contact_persons jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.emergency_drills (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  emergency_plan_id uuid not null references public.emergency_plans(id) on delete cascade,
  drill_date date not null default current_date,
  participants text,
  outcome text,
  lessons_learned text,
  improvements_needed text,
  next_drill_date date,
  conducted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_lots_tenant on public.lots(tenant_id);
create index idx_lots_product on public.lots(product_id);
create index idx_lots_status on public.lots(status);
create index idx_lots_expiry on public.lots(expiry_date);
create index idx_lots_supplier on public.lots(supplier_id);
create index idx_lot_movements_lot on public.lot_movements(lot_id);
create index idx_lot_movements_tenant on public.lot_movements(tenant_id);
create index idx_lot_movements_related on public.lot_movements(related_lot_id);
create index idx_recall_simulations_tenant on public.recall_simulations(tenant_id);
create index idx_recall_results_simulation on public.recall_results(recall_simulation_id);
create index idx_recall_results_lot on public.recall_results(lot_id);
create index idx_cleaning_plans_tenant on public.cleaning_plans(tenant_id);
create index idx_cleaning_tasks_tenant on public.cleaning_tasks(tenant_id);
create index idx_cleaning_tasks_plan on public.cleaning_tasks(cleaning_plan_id);
create index idx_cleaning_tasks_status on public.cleaning_tasks(status);
create index idx_pest_control_tenant on public.pest_control_records(tenant_id);
create index idx_emergency_plans_tenant on public.emergency_plans(tenant_id);
create index idx_emergency_drills_tenant on public.emergency_drills(tenant_id);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.lots enable row level security;
alter table public.lot_movements enable row level security;
alter table public.recall_simulations enable row level security;
alter table public.recall_results enable row level security;
alter table public.cleaning_plans enable row level security;
alter table public.cleaning_tasks enable row level security;
alter table public.pest_control_records enable row level security;
alter table public.emergency_plans enable row level security;
alter table public.emergency_drills enable row level security;

-- All tables: tenant-scoped with standard policies
create policy lots_select on public.lots for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy lots_insert on public.lots for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin']));
create policy lots_update on public.lots for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin']))
  with check (tenant_id = public.current_tenant_id());
create policy lots_delete on public.lots for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'super_admin']));

create policy lot_movements_select on public.lot_movements for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy lot_movements_insert on public.lot_movements for insert to authenticated
  with check (tenant_id = public.current_tenant_id());
create policy lot_movements_update on public.lot_movements for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy lot_movements_delete on public.lot_movements for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'super_admin']));

create policy recall_sim_select on public.recall_simulations for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy recall_sim_insert on public.recall_simulations for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin']));
create policy recall_sim_update on public.recall_simulations for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin']))
  with check (tenant_id = public.current_tenant_id());
create policy recall_sim_delete on public.recall_simulations for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'super_admin']));

create policy recall_results_select on public.recall_results for select to authenticated
  using (exists (select 1 from public.recall_simulations rs where rs.id = recall_results.recall_simulation_id and rs.tenant_id = public.current_tenant_id()));
create policy recall_results_insert on public.recall_results for insert to authenticated
  with check (exists (select 1 from public.recall_simulations rs where rs.id = recall_results.recall_simulation_id and rs.tenant_id = public.current_tenant_id()));
create policy recall_results_delete on public.recall_results for delete to authenticated
  using (exists (select 1 from public.recall_simulations rs where rs.id = recall_results.recall_simulation_id and rs.tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'super_admin'])));

create policy cleaning_plans_select on public.cleaning_plans for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy cleaning_plans_insert on public.cleaning_plans for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin']));
create policy cleaning_plans_update on public.cleaning_plans for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin']))
  with check (tenant_id = public.current_tenant_id());
create policy cleaning_plans_delete on public.cleaning_plans for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'super_admin']));

create policy cleaning_tasks_select on public.cleaning_tasks for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy cleaning_tasks_insert on public.cleaning_tasks for insert to authenticated
  with check (tenant_id = public.current_tenant_id());
create policy cleaning_tasks_update on public.cleaning_tasks for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy cleaning_tasks_delete on public.cleaning_tasks for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'super_admin']));

create policy pest_control_select on public.pest_control_records for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy pest_control_insert on public.pest_control_records for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin']));
create policy pest_control_update on public.pest_control_records for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin']))
  with check (tenant_id = public.current_tenant_id());
create policy pest_control_delete on public.pest_control_records for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'super_admin']));

create policy emergency_plans_select on public.emergency_plans for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy emergency_plans_insert on public.emergency_plans for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin']));
create policy emergency_plans_update on public.emergency_plans for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin']))
  with check (tenant_id = public.current_tenant_id());
create policy emergency_plans_delete on public.emergency_plans for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'super_admin']));

create policy emergency_drills_select on public.emergency_drills for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy emergency_drills_insert on public.emergency_drills for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin']));
create policy emergency_drills_update on public.emergency_drills for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin']))
  with check (tenant_id = public.current_tenant_id());
create policy emergency_drills_delete on public.emergency_drills for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'super_admin']));

-- ============================================================================
-- TRIGGERS
-- ============================================================================

create trigger trg_lots_updated_at before update on public.lots for each row execute function public.set_updated_at();
create trigger trg_recall_sim_updated_at before update on public.recall_simulations for each row execute function public.set_updated_at();
create trigger trg_cleaning_plans_updated_at before update on public.cleaning_plans for each row execute function public.set_updated_at();
create trigger trg_cleaning_tasks_updated_at before update on public.cleaning_tasks for each row execute function public.set_updated_at();
create trigger trg_emergency_plans_updated_at before update on public.emergency_plans for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: Trace upstream (find source lots)
-- ============================================================================

create or replace function public.trace_upstream(p_lot_id uuid)
returns table(lot_id uuid, lot_number text, product_name text, movement_type movement_type, quantity numeric, performed_at timestamptz, trace_path jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_lot uuid := p_lot_id;
  v_path jsonb := '[]'::jsonb;
  v_depth integer := 0;
  v_lot record;
begin
  -- BFS traversal upstream
  while v_current_lot is not null and v_depth < 50 loop
    select l.id, l.lot_number, p.name into v_lot
    from public.lots l
    join public.products p on p.id = l.product_id
    where l.id = v_current_lot;

    if not found then exit; end if;

    v_path := v_path || jsonb_build_object(
      'lot_id', v_lot.id,
      'lot_number', v_lot.lot_number,
      'product_name', v_lot.name,
      'depth', v_depth
    );

    return next;
    return query
    select lm.lot_id, l.lot_number, p.name, lm.movement_type, lm.quantity, lm.performed_at, v_path
    from public.lot_movements lm
    join public.lots l on l.id = lm.lot_id
    join public.products p on p.id = l.product_id
    where lm.related_lot_id = v_current_lot
      and lm.movement_type in ('consume', 'transfer_in');

    -- Move to next lot (simplified - in production would need proper traversal)
    select lm.lot_id into v_current_lot
    from public.lot_movements lm
    where lm.related_lot_id = v_current_lot
      and lm.movement_type = 'consume'
    limit 1;

    v_depth := v_depth + 1;
  end loop;
end;
$$;

-- ============================================================================
-- FUNCTION: Trace downstream (find affected lots and shipments)
-- ============================================================================

create or replace function public.trace_downstream(p_lot_id uuid)
returns table(lot_id uuid, lot_number text, product_name text, movement_type movement_type, quantity numeric, performed_at timestamptz, trace_path jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_lot uuid := p_lot_id;
  v_path jsonb := '[]'::jsonb;
  v_depth integer := 0;
  v_lot record;
begin
  while v_current_lot is not null and v_depth < 50 loop
    select l.id, l.lot_number, p.name into v_lot
    from public.lots l
    join public.products p on p.id = l.product_id
    where l.id = v_current_lot;

    if not found then exit; end if;

    v_path := v_path || jsonb_build_object(
      'lot_id', v_lot.id,
      'lot_number', v_lot.lot_number,
      'product_name', v_lot.name,
      'depth', v_depth
    );

    return next;
    return query
    select lm.related_lot_id, l.lot_number, p.name, lm.movement_type, lm.quantity, lm.performed_at, v_path
    from public.lot_movements lm
    join public.lots l on l.id = lm.related_lot_id
    join public.products p on p.id = l.product_id
    where lm.lot_id = v_current_lot
      and lm.movement_type in ('produce', 'transfer_out', 'ship');

    select lm.related_lot_id into v_current_lot
    from public.lot_movements lm
    where lm.lot_id = v_current_lot
      and lm.movement_type = 'produce'
    limit 1;

    v_depth := v_depth + 1;
  end loop;
end;
$$;

-- ============================================================================
-- FUNCTION: Run recall simulation
-- ============================================================================

create or replace function public.run_recall_simulation(
  p_tenant_id uuid,
  p_start_lot_id uuid,
  p_scenario text,
  p_initiated_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sim_id uuid;
  v_start_time timestamptz := clock_timestamp();
  v_lot record;
  v_count integer := 0;
  v_total_qty numeric := 0;
begin
  -- Create simulation record
  insert into public.recall_simulations (
    tenant_id, name, scenario, start_lot_id, status, initiated_by, initiated_at
  )
  values (
    p_tenant_id,
    'Rappel simulé - Lot ' || (select lot_number from public.lots where id = p_start_lot_id),
    p_scenario,
    p_start_lot_id,
    'in_progress',
    p_initiated_by,
    now()
  )
  returning id into v_sim_id;

  -- Trace downstream and record results
  for v_lot in select * from public.trace_downstream(p_start_lot_id) loop
    insert into public.recall_results (
      recall_simulation_id, lot_id, found, found_at,
      current_quantity, current_status, trace_direction, trace_path
    )
    values (
      v_sim_id, v_lot.lot_id, true, now(),
      (select quantity_current from public.lots where id = v_lot.lot_id),
      (select status from public.lots where id = v_lot.lot_id),
      'downstream', v_lot.trace_path
    );

    v_count := v_count + 1;
    v_total_qty := v_total_qty + coalesce(v_lot.quantity, 0);
  end loop;

  -- Also trace upstream
  for v_lot in select * from public.trace_upstream(p_start_lot_id) loop
    insert into public.recall_results (
      recall_simulation_id, lot_id, found, found_at,
      current_quantity, current_status, trace_direction, trace_path
    )
    values (
      v_sim_id, v_lot.lot_id, true, now(),
      (select quantity_current from public.lots where id = v_lot.lot_id),
      (select status from public.lots where id = v_lot.lot_id),
      'upstream', v_lot.trace_path
    );

    v_count := v_count + 1;
  end loop;

  -- Complete simulation
  update public.recall_simulations
  set status = 'completed',
      completed_at = now(),
      total_lots_found = v_count,
      total_quantity_found = v_total_qty,
      time_to_complete_minutes = extract(epoch from (clock_timestamp() - v_start_time)) / 60
  where id = v_sim_id;

  return v_sim_id;
end;
$$;
