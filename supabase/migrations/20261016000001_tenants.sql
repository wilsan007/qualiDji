-- ============================================================================
-- Migration 0001 (1/4): Socle spec — tenants & identités
-- Spec v1.0 Août 2026 — §7.3 RLS isolation tenant
-- ============================================================================

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  role text not null check (role in (
    'admin', 'quality_manager', 'site_manager', 'process_owner',
    'operator', 'internal_auditor', 'external_auditor', 'director'
  )),
  display_name text,
  created_at timestamptz not null default now()
);
create index user_profiles_tenant_idx on public.user_profiles (tenant_id);
