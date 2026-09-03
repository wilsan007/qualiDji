-- ============================================================================
-- Migration 0019: Enterprise — multi-site consolidation, API keys
-- ============================================================================
-- Sprint 22: Grands comptes
-- Tables: site_groups, api_keys, api_key_usage, consolidated_reports
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type api_key_scope as enum (
  'read', 'write', 'admin', 'webhook', 'integration'
);

create type report_type as enum (
  'compliance_summary', 'audit_history', 'nc_summary', 'kpi_dashboard',
  'risk_register', 'training_status', 'supplier_status', 'custom'
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- Site groups: group multiple tenants/sites for consolidated reporting
create table public.site_groups (
  id uuid primary key default uuid_generate_v4(),
  parent_tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Link sites to groups
create table public.site_group_members (
  id uuid primary key default uuid_generate_v4(),
  site_group_id uuid not null references public.site_groups(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  is_primary boolean not null default false,
  joined_at timestamptz not null default now(),
  unique(site_group_id, tenant_id)
);

-- API keys for programmatic access
create table public.api_keys (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  key_prefix text not null,         -- first 8 chars for identification
  key_hash text not null unique,    -- SHA-256 hash of full key
  scopes api_key_scope[] not null default '{read}'::api_key_scope[],
  -- Rate limiting
  rate_limit_per_minute integer not null default 60,
  -- Lifecycle
  is_active boolean not null default true,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_reason text
);

-- API key usage tracking
create table public.api_key_usage (
  id uuid primary key default uuid_generate_v4(),
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  endpoint text not null,
  method text not null,             -- GET, POST, PUT, DELETE
  status_code integer not null,
  response_time_ms integer,
  ip_address text,
  request_body_size integer,
  created_at timestamptz not null default now()
);

-- Consolidated reports across sites
create table public.consolidated_reports (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  site_group_id uuid references public.site_groups(id) on delete set null,
  type report_type not null,
  title text not null,
  parameters jsonb not null default '{}'::jsonb,  -- filters, date range, etc.
  -- Generated data
  data jsonb,
  summary jsonb,                    -- high-level summary metrics
  -- File
  file_url text,
  file_format text not null default 'json',  -- json, pdf, xlsx, csv
  -- Status
  status text not null default 'pending',  -- pending, generating, completed, failed
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz,
  -- Scheduling
  is_scheduled boolean not null default false,
  schedule_cron text,               -- cron expression for recurring reports
  next_run_at timestamptz,
  -- Recipients
  recipient_emails text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_site_groups_parent on public.site_groups(parent_tenant_id);
create index idx_site_group_members_group on public.site_group_members(site_group_id);
create index idx_site_group_members_tenant on public.site_group_members(tenant_id);
create index idx_api_keys_tenant on public.api_keys(tenant_id);
create index idx_api_keys_hash on public.api_keys(key_hash);
create index idx_api_keys_active on public.api_keys(is_active);
create index idx_api_key_usage_key on public.api_key_usage(api_key_id);
create index idx_api_key_usage_tenant on public.api_key_usage(tenant_id);
create index idx_api_key_usage_created on public.api_key_usage(created_at);
create index idx_consolidated_reports_tenant on public.consolidated_reports(tenant_id);
create index idx_consolidated_reports_group on public.consolidated_reports(site_group_id);
create index idx_consolidated_reports_type on public.consolidated_reports(type);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.site_groups enable row level security;
alter table public.site_group_members enable row level security;
alter table public.api_keys enable row level security;
alter table public.api_key_usage enable row level security;
alter table public.consolidated_reports enable row level security;

-- Site groups: tenant admins can manage
create policy site_groups_select on public.site_groups
  for select to authenticated
  using (parent_tenant_id = public.current_tenant_id());

create policy site_groups_insert on public.site_groups
  for insert to authenticated
  with check (
    parent_tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

create policy site_groups_update on public.site_groups
  for update to authenticated
  using (
    parent_tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  )
  with check (parent_tenant_id = public.current_tenant_id());

create policy site_groups_delete on public.site_groups
  for delete to authenticated
  using (
    parent_tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Site group members
create policy site_group_members_select on public.site_group_members
  for select to authenticated
  using (
    site_group_id in (select id from public.site_groups where parent_tenant_id = public.current_tenant_id())
    or tenant_id = public.current_tenant_id()
  );

create policy site_group_members_insert on public.site_group_members
  for insert to authenticated
  with check (
    site_group_id in (select id from public.site_groups where parent_tenant_id = public.current_tenant_id())
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

create policy site_group_members_delete on public.site_group_members
  for delete to authenticated
  using (
    site_group_id in (select id from public.site_groups where parent_tenant_id = public.current_tenant_id())
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- API keys: tenant admins can manage
create policy api_keys_select on public.api_keys
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

create policy api_keys_insert on public.api_keys
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

create policy api_keys_update on public.api_keys
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy api_keys_delete on public.api_keys
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- API key usage: tenant admins can see
create policy api_key_usage_select on public.api_key_usage
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

create policy api_key_usage_insert on public.api_key_usage
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

-- Consolidated reports
create policy consolidated_reports_select on public.consolidated_reports
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy consolidated_reports_insert on public.consolidated_reports
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy consolidated_reports_update on public.consolidated_reports
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy consolidated_reports_delete on public.consolidated_reports
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

create trigger trg_site_groups_updated_at
  before update on public.site_groups
  for each row execute function public.set_updated_at();

create trigger trg_consolidated_reports_updated_at
  before update on public.consolidated_reports
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: Generate API key
-- ============================================================================

create or replace function public.generate_api_key(
  p_tenant_id uuid,
  p_name text,
  p_scopes api_key_scope[] default '{read}'::api_key_scope[],
  p_expires_at timestamptz default null,
  p_created_by uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_prefix text;
  v_hash text;
  v_id uuid;
begin
  -- Generate random key: qd_<32 random hex chars>
  v_key := 'qd_' || encode(gen_random_bytes(24), 'hex');
  v_prefix := left(v_key, 11);
  v_hash := encode(digest(v_key, 'sha256'), 'hex');

  insert into public.api_keys (
    tenant_id, name, key_prefix, key_hash, scopes, expires_at, created_by
  )
  values (
    p_tenant_id, p_name, v_prefix, v_hash, p_scopes, p_expires_at, p_created_by
  )
  returning id into v_id;

  -- Return the full key only once
  return v_key;
end;
$$;

-- ============================================================================
-- FUNCTION: Validate API key
-- ============================================================================

create or replace function public.validate_api_key(p_key text)
returns table(tenant_id uuid, api_key_id uuid, scopes api_key_scope[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_key record;
begin
  v_hash := encode(digest(p_key, 'sha256'), 'hex');

  select * into v_key from public.api_keys
  where key_hash = v_hash
    and is_active = true
    and (expires_at is null or expires_at > now());

  if not found then
    return;
  end if;

  -- Update last used
  update public.api_keys set last_used_at = now() where id = v_key.id;

  return query select v_key.tenant_id, v_key.id, v_key.scopes;
end;
$$;
