-- ============================================================================
-- Migration 0009 : §3.4 Gestion des utilisateurs
--   - activation/suspension sur user_profiles (is_active, suspended_at/by)
--   - historique des changements de rôle (user_role_history)
-- Idempotent.
-- ============================================================================

alter table public.user_profiles
  add column if not exists is_active boolean not null default true,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.user_role_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  old_role text,
  new_role text not null,
  changed_by uuid,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists user_role_history_user_idx
  on public.user_role_history (user_id, created_at desc);

alter table public.user_role_history enable row level security;

drop policy if exists user_role_history_select on public.user_role_history;
create policy user_role_history_select on public.user_role_history for select using (
  tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
);
-- Écritures : exclusivement via le backend (service_role), aucune policy insert/update.

-- Privileges (table créée hors default privileges de la stack) :
--   authenticated : lecture seule (via la policy) ; service_role : tout (backend).
grant select on public.user_role_history to authenticated;
grant all on public.user_role_history to service_role;
grant all on public.user_role_history to postgres;
