-- ============================================================================
-- Migration 0001: Core platform tables, RLS helpers, and audit log
-- ============================================================================
-- Creates: tenants, sites, profiles, memberships, role_permissions,
--          invitations, audit_log
-- Includes: RLS helper functions, hash chain trigger, RLS policies
-- ============================================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================================
-- ENUMS
-- ============================================================================

create type tenant_plan as enum ('free', 'tpe', 'pme', 'ge');
create type tenant_status as enum ('trial', 'active', 'suspended', 'cancelled');
create type ui_mode as enum ('guided', 'assisted', 'expert');
create type user_role as enum (
  'super_admin',
  'tenant_admin',
  'director',
  'quality_manager',
  'internal_auditor',
  'process_owner',
  'operator',
  'external_auditor',
  'supplier'
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- Tenants (one row per client company)
create table public.tenants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  plan tenant_plan not null default 'free',
  status tenant_status not null default 'trial',
  settings jsonb not null default '{}'::jsonb,
  country text not null default 'DJ',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sites (physical locations, billing unit)
create table public.sites (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  address text,
  geo point,
  timezone text not null default 'Africa/Djibouti',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Profiles (user profile, linked to auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  full_name text not null,
  phone text,
  lang text not null default 'fr',
  competence jsonb not null default '{}'::jsonb,
  ui_mode ui_mode not null default 'guided',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Memberships (user role and scope per tenant)
create table public.memberships (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role user_role not null default 'operator',
  site_ids uuid[] not null default '{}'::uuid[],
  process_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, user_id)
);

-- Role permissions (reference table for RLS)
create table public.role_permissions (
  role user_role not null,
  permission text not null,
  primary key (role, permission)
);

-- Invitations
create table public.invitations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  role user_role not null default 'operator',
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Audit log (integrity chain, append-only)
create table public.audit_log (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  prev_hash text,
  hash text not null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_sites_tenant on public.sites(tenant_id);
create index idx_profiles_tenant on public.profiles(tenant_id);
create index idx_memberships_tenant_user on public.memberships(tenant_id, user_id);
create index idx_memberships_user on public.memberships(user_id);
create index idx_invitations_tenant on public.invitations(tenant_id);
create index idx_invitations_token on public.invitations(token);
create index idx_invitations_email on public.invitations(email);
create index idx_audit_log_tenant on public.audit_log(tenant_id);
create index idx_audit_log_entity on public.audit_log(entity, entity_id);

-- ============================================================================
-- RLS HELPER FUNCTIONS (security definer)
-- ============================================================================

-- Get current tenant_id from JWT app_metadata
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid,
    -- Fallback: look up from memberships
    (
      select m.tenant_id
      from public.memberships m
      where m.user_id = (select auth.uid())
      limit 1
    )
  )
$$;

-- Check if current user has one of the specified roles
create or replace function public.has_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.tenant_id = public.current_tenant_id()
      and m.role::text = any(roles)
  )
$$;

-- Check if current user can access a specific site
create or replace function public.can_access_site(site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when public.has_role(array['super_admin', 'tenant_admin', 'director', 'quality_manager']) then
        true
      else
        exists (
          select 1
          from public.memberships m
          where m.user_id = (select auth.uid())
            and m.tenant_id = public.current_tenant_id()
            and site_id = any(m.site_ids)
        )
    end
$$;

-- Check if current user has a specific permission
create or replace function public.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.user_id = (select auth.uid())
      and m.tenant_id = public.current_tenant_id()
      and rp.permission = perm
  )
$$;

-- ============================================================================
-- AUDIT LOG HASH CHAIN
-- ============================================================================

-- Function to compute hash for audit log entries
create or replace function public.compute_audit_hash(
  p_prev_hash text,
  p_payload jsonb,
  p_actor_id uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_created_at timestamptz
)
returns text
language plpgsql
immutable
security definer
as $$
declare
  v_input text;
  v_hash text;
begin
  v_input := coalesce(p_prev_hash, '') || '|' ||
             coalesce(p_actor_id::text, '') || '|' ||
             p_action || '|' ||
             p_entity || '|' ||
             coalesce(p_entity_id::text, '') || '|' ||
             p_payload::text || '|' ||
             p_created_at::text;
  v_hash := encode(digest(v_input, 'sha256'), 'hex');
  return v_hash;
end;
$$;

-- Trigger function to set hash chain on audit_log insert
create or replace function public.audit_log_hash_chain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_hash text;
begin
  -- Get the previous hash for this tenant
  select hash into v_prev_hash
  from public.audit_log
  where tenant_id = new.tenant_id
  order by id desc
  limit 1;

  new.prev_hash := v_prev_hash;
  new.hash := public.compute_audit_hash(
    v_prev_hash,
    new.payload,
    new.actor_id,
    new.action,
    new.entity,
    new.entity_id,
    new.created_at
  );

  return new;
end;
$$;

-- Trigger on audit_log
create trigger trg_audit_log_hash_chain
  before insert on public.audit_log
  for each row
  execute function public.audit_log_hash_chain();

-- Function to verify the audit chain integrity
create or replace function public.verify_audit_chain(p_tenant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry record;
  v_expected_hash text;
  v_prev_hash text := null;
begin
  for v_entry in
    select id, prev_hash, hash, payload, actor_id, action, entity, entity_id, created_at
    from public.audit_log
    where tenant_id = p_tenant_id
    order by id
  loop
    v_expected_hash := public.compute_audit_hash(
      v_prev_hash,
      v_entry.payload,
      v_entry.actor_id,
      v_entry.action,
      v_entry.entity,
      v_entry.entity_id,
      v_entry.created_at
    );

    if v_entry.hash is distinct from v_expected_hash then
      return false;
    end if;

    if v_entry.prev_hash is distinct from v_prev_hash then
      return false;
    end if;

    v_prev_hash := v_entry.hash;
  end loop;

  return true;
end;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
alter table public.tenants enable row level security;
alter table public.sites enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.role_permissions enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_log enable row level security;

-- Tenants: users can only see their own tenant
create policy tenants_select on public.tenants
  for select to authenticated
  using (
    id = public.current_tenant_id()
    or public.has_role(array['super_admin'])
  );

create policy tenants_update on public.tenants
  for update to authenticated
  using (public.has_role(array['tenant_admin', 'super_admin']))
  with check (public.has_role(array['tenant_admin', 'super_admin']));

-- Sites: filtered by tenant and site access
create policy sites_select on public.sites
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.has_role(array['super_admin', 'tenant_admin', 'director', 'quality_manager'])
      or exists (
        select 1 from public.memberships m
        where m.user_id = (select auth.uid())
          and m.tenant_id = public.current_tenant_id()
          and sites.id = any(m.site_ids)
      )
    )
  );

create policy sites_insert on public.sites
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

create policy sites_update on public.sites
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Profiles: users can see their own profile and profiles in their tenant
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (
      tenant_id = public.current_tenant_id()
      and public.has_role(array['super_admin', 'tenant_admin', 'director', 'quality_manager'])
    )
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using (
    id = (select auth.uid())
    or (
      tenant_id = public.current_tenant_id()
      and public.has_role(array['tenant_admin', 'super_admin'])
    )
  )
  with check (
    id = (select auth.uid())
    or (
      tenant_id = public.current_tenant_id()
      and public.has_role(array['tenant_admin', 'super_admin'])
    )
  );

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (
    id = (select auth.uid())
    or public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Memberships: admin and self can read; admin can write
create policy memberships_select on public.memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      tenant_id = public.current_tenant_id()
      and public.has_role(array['super_admin', 'tenant_admin', 'director', 'quality_manager'])
    )
  );

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

create policy memberships_update on public.memberships
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

create policy memberships_delete on public.memberships
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Role permissions: readable by all authenticated users
create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (true);

-- Invitations: admin can manage; users can see invitations for their tenant
create policy invitations_select on public.invitations
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['super_admin', 'tenant_admin', 'quality_manager'])
  );

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

create policy invitations_update on public.invitations
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Audit log: append-only, read by admin and quality_manager
-- No UPDATE or DELETE policies = those operations are blocked
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['super_admin', 'tenant_admin', 'quality_manager', 'external_auditor'])
  );

create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

-- ============================================================================
-- SEED: Default role permissions
-- ============================================================================

insert into public.role_permissions (role, permission) values
  -- super_admin: everything
  ('super_admin', '*'),
  -- tenant_admin: full tenant management
  ('tenant_admin', 'manage_tenant'),
  ('tenant_admin', 'manage_users'),
  ('tenant_admin', 'manage_sites'),
  ('tenant_admin', 'manage_modules'),
  ('tenant_admin', 'view_audit_log'),
  ('tenant_admin', 'view_all_data'),
  -- director: view everything, sign off
  ('director', 'view_dashboard'),
  ('director', 'sign_documents'),
  ('director', 'conduct_review'),
  ('director', 'view_all_data'),
  -- quality_manager: manage compliance
  ('quality_manager', 'manage_compliance'),
  ('quality_manager', 'manage_documents'),
  ('quality_manager', 'manage_audits'),
  ('quality_manager', 'manage_nc'),
  ('quality_manager', 'verify_tasks'),
  ('quality_manager', 'view_all_data'),
  ('quality_manager', 'view_audit_log'),
  ('quality_manager', 'manage_external_audits'),
  -- internal_auditor: conduct audits
  ('internal_auditor', 'conduct_audits'),
  ('internal_auditor', 'view_audits'),
  ('internal_auditor', 'create_findings'),
  -- process_owner: manage process tasks
  ('process_owner', 'view_process_data'),
  ('process_owner', 'verify_tasks'),
  ('process_owner', 'manage_process_nc'),
  -- operator: execute tasks
  ('operator', 'view_own_tasks'),
  ('operator', 'complete_tasks'),
  ('operator', 'declare_nc'),
  ('operator', 'view_own_documents'),
  -- external_auditor: read-only during audit window
  ('external_auditor', 'view_audit_evidence'),
  ('external_auditor', 'create_auditor_notes'),
  -- supplier: portal access
  ('supplier', 'view_own_supplier_data'),
  ('supplier', 'upload_documents');

-- ============================================================================
-- TRIGGER: Auto-create profile on user signup
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, lang)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_user_meta_data ->> 'lang', 'fr')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================================
-- UPDATED_AT triggers
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

create trigger trg_sites_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_memberships_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();
