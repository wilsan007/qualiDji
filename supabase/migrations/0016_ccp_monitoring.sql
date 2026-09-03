-- ============================================================================
-- Migration 0016: CCP monitoring, mobile input, IoT sensors
-- ============================================================================
-- Sprint 19: Surveillance CCP et capteurs
-- Tables: ccp_monitoring_records, deviations, iot_sensors,
--         sensor_readings, sensor_webhooks
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type deviation_status as enum (
  'open', 'contained', 'under_investigation', 'corrected', 'closed'
);

create type deviation_disposition as enum (
  'release', 'rework', 'destroy', 'hold', 'recall', 'use_decision'
);

create type sensor_type as enum (
  'temperature', 'humidity', 'pressure', 'ph', 'weight',
  'metal_detector', 'flow_rate', 'door_contact', 'other'
);

create type sensor_status as enum ('active', 'inactive', 'error', 'calibration_due');

create type reading_status as enum ('normal', 'warning', 'critical', 'offline');

-- ============================================================================
-- TABLES
-- ============================================================================

-- deviations first (without FK to ccp_monitoring_records, added later)
create table public.deviations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  control_point_id uuid not null references public.control_points(id) on delete cascade,
  monitoring_record_id uuid,  -- FK added after ccp_monitoring_records
  -- Product/lot affected
  product_id uuid references public.products(id) on delete set null,
  lot_number text,
  quantity_affected numeric,
  -- Deviation details
  description text not null,
  measured_value numeric,
  expected_min numeric,
  expected_max numeric,
  -- Disposition
  disposition deviation_disposition not null default 'hold',
  disposition_notes text,
  -- Containment
  immediate_action text,           -- immediate correction taken
  contained_at timestamptz,
  contained_by uuid references auth.users(id) on delete set null,
  -- Linked nonconformity
  nonconformity_id uuid references public.nonconformities(id) on delete set null,
  -- Status
  status deviation_status not null default 'open',
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  closure_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ccp_monitoring_records (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  control_point_id uuid not null references public.control_points(id) on delete cascade,
  -- Who and when
  recorded_by uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  -- Values
  measured_value numeric,
  measured_unit text,              -- °C, ppm, minutes
  is_within_limit boolean not null default true,
  -- Evidence
  photo_url text,
  notes text,
  -- Location (for mobile)
  gps_lat numeric,
  gps_lng numeric,
  -- Second-level verification (mandatory for CCP)
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  verification_result text,       -- 'compliant', 'non_compliant', 'requires_action'
  -- Linked deviation
  deviation_id uuid references public.deviations(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Now add the FK from deviations.monitoring_record_id to ccp_monitoring_records
alter table public.deviations
  add constraint deviations_monitoring_record_fk
  foreign key (monitoring_record_id) references public.ccp_monitoring_records(id) on delete set null;

create table public.iot_sensors (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  control_point_id uuid references public.control_points(id) on delete set null,
  code text not null,              -- e.g. 'SENSOR-001'
  name text not null,
  type sensor_type not null,
  status sensor_status not null default 'active',
  -- Connection
  mac_address text,
  ip_address text,
  webhook_token text unique,       -- for receiving data from sensor
  -- Configuration
  reading_interval_seconds integer not null default 60,
  min_threshold numeric,
  max_threshold numeric,
  warning_threshold_min numeric,
  warning_threshold_max numeric,
  unit text,                       -- °C, %, ppm
  -- Location
  location_description text,
  gps_lat numeric,
  gps_lng numeric,
  -- Calibration
  last_calibrated_at timestamptz,
  next_calibration_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, code)
);

create table public.sensor_readings (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sensor_id uuid not null references public.iot_sensors(id) on delete cascade,
  value numeric not null,
  unit text,
  status reading_status not null default 'normal',
  read_at timestamptz not null default now(),
  -- Auto-generated deviation if critical
  deviation_id uuid references public.deviations(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_ccp_monitoring_tenant on public.ccp_monitoring_records(tenant_id);
create index idx_ccp_monitoring_cp on public.ccp_monitoring_records(control_point_id);
create index idx_ccp_monitoring_recorded on public.ccp_monitoring_records(recorded_at desc);
create index idx_ccp_monitoring_verified on public.ccp_monitoring_records(verified_at);
create index idx_deviations_tenant on public.deviations(tenant_id);
create index idx_deviations_cp on public.deviations(control_point_id);
create index idx_deviations_status on public.deviations(status);
create index idx_iot_sensors_tenant on public.iot_sensors(tenant_id);
create index idx_iot_sensors_cp on public.iot_sensors(control_point_id);
create index idx_iot_sensors_token on public.iot_sensors(webhook_token);
create index idx_sensor_readings_sensor on public.sensor_readings(sensor_id);
create index idx_sensor_readings_tenant on public.sensor_readings(tenant_id);
create index idx_sensor_readings_status on public.sensor_readings(status);
create index idx_sensor_readings_time on public.sensor_readings(read_at desc);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.ccp_monitoring_records enable row level security;
alter table public.deviations enable row level security;
alter table public.iot_sensors enable row level security;
alter table public.sensor_readings enable row level security;

-- CCP monitoring: all tenant users can see; operators create, verifiers verify
create policy ccp_monitoring_select on public.ccp_monitoring_records
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy ccp_monitoring_insert on public.ccp_monitoring_records
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
  );

create policy ccp_monitoring_update on public.ccp_monitoring_records
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy ccp_monitoring_delete on public.ccp_monitoring_records
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Deviations: all tenant users can see; quality roles manage
create policy deviations_select on public.deviations
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy deviations_insert on public.deviations
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
  );

create policy deviations_update on public.deviations
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy deviations_delete on public.deviations
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- IoT sensors: all tenant users can see; quality roles manage
create policy iot_sensors_select on public.iot_sensors
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy iot_sensors_insert on public.iot_sensors
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy iot_sensors_update on public.iot_sensors
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy iot_sensors_delete on public.iot_sensors
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Sensor readings: all tenant users can see; insert via webhook (service role)
create policy sensor_readings_select on public.sensor_readings
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy sensor_readings_insert on public.sensor_readings
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy sensor_readings_delete on public.sensor_readings
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

create trigger trg_deviations_updated_at
  before update on public.deviations
  for each row execute function public.set_updated_at();

create trigger trg_iot_sensors_updated_at
  before update on public.iot_sensors
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: Process sensor reading and auto-create deviation if critical
-- ============================================================================

create or replace function public.process_sensor_reading(
  p_sensor_id uuid,
  p_value numeric,
  p_read_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sensor record;
  v_status reading_status;
  v_reading_id uuid;
  v_deviation_id uuid;
  v_tenant_id uuid;
begin
  select * into v_sensor from public.iot_sensors
  where id = p_sensor_id and is_active = true;

  if not found then
    raise exception 'Sensor not found or inactive';
  end if;

  v_tenant_id := v_sensor.tenant_id;

  -- Determine status
  if v_sensor.max_threshold is not null and p_value > v_sensor.max_threshold then
    v_status := 'critical';
  elsif v_sensor.min_threshold is not null and p_value < v_sensor.min_threshold then
    v_status := 'critical';
  elsif v_sensor.warning_threshold_max is not null and p_value > v_sensor.warning_threshold_max then
    v_status := 'warning';
  elsif v_sensor.warning_threshold_min is not null and p_value < v_sensor.warning_threshold_min then
    v_status := 'warning';
  else
    v_status := 'normal';
  end if;

  -- Insert reading
  insert into public.sensor_readings (tenant_id, sensor_id, value, unit, status, read_at)
  values (v_tenant_id, p_sensor_id, p_value, v_sensor.unit, v_status, p_read_at)
  returning id into v_reading_id;

  -- Auto-create deviation if critical
  if v_status = 'critical' and v_sensor.control_point_id is not null then
    insert into public.deviations (
      tenant_id, control_point_id, description, measured_value,
      expected_min, expected_max, disposition, status, immediate_action,
      contained_at, contained_by
    )
    values (
      v_tenant_id, v_sensor.control_point_id,
      'Lecture capteur hors limite: ' || p_value || ' ' || coalesce(v_sensor.unit, ''),
      p_value, v_sensor.min_threshold, v_sensor.max_threshold,
      'hold', 'open',
      'Lot bloqué automatiquement par lecture capteur hors limite',
      now(), null
    )
    returning id into v_deviation_id;

    -- Link reading to deviation
    update public.sensor_readings set deviation_id = v_deviation_id
    where id = v_reading_id;

    -- Notify responsible persons
    perform public.create_notification(
      v_tenant_id,
      v_sensor.control_point_id::uuid,
      'critical',
      'Déviation CCP détectée par capteur',
      'Capteur ' || v_sensor.code || ': valeur ' || p_value || ' ' || coalesce(v_sensor.unit, '') ||
      ' hors limite [' || coalesce(v_sensor.min_threshold::text, '?') || ' - ' ||
      coalesce(v_sensor.max_threshold::text, '?') || ']',
      '/tenant/deviations',
      'Voir la déviation',
      'urgent'
    );
  end if;

  return v_reading_id;
end;
$$;

-- ============================================================================
-- TRIGGER: Block lot and notify on CCP monitoring out of limit
-- ============================================================================

create or replace function public.on_ccp_monitoring_recorded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cp record;
  v_deviation_id uuid;
begin
  select * into v_cp from public.control_points where id = new.control_point_id;

  if not found then return new; end if;

  -- If out of limit and CCP, auto-create deviation
  if new.is_within_limit = false and v_cp.type = 'ccp' then
    insert into public.deviations (
      tenant_id, control_point_id, monitoring_record_id,
      description, measured_value,
      expected_min, expected_max,
      disposition, status, immediate_action,
      contained_at
    )
    values (
      new.tenant_id, new.control_point_id, new.id,
      'Lecture CCP hors limite: ' || coalesce(new.measured_value::text, 'N/A') || ' ' || coalesce(new.measured_unit, ''),
      new.measured_value,
      v_cp.critical_limit_min, v_cp.critical_limit_max,
      'hold', 'open',
      'Lot bloqué - lecture hors limite critique',
      now()
    )
    returning id into v_deviation_id;

    -- Link monitoring record to deviation
    update public.ccp_monitoring_records set deviation_id = v_deviation_id
    where id = new.id;

    -- Notify
    perform public.create_notification(
      new.tenant_id,
      new.recorded_by,
      'critical',
      'Déviation CCP: ' || v_cp.code,
      'Lecture hors limite critique pour ' || v_cp.hazard || '. Lot bloqué.',
      '/tenant/deviations',
      'Voir la déviation',
      'urgent'
    );
  end if;

  return new;
end;
$$;

create trigger trg_on_ccp_monitoring_recorded
  after insert on public.ccp_monitoring_records
  for each row
  execute function public.on_ccp_monitoring_recorded();
