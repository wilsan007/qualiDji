-- ============================================================================
-- Migration 0010 : Module G — Notifications (V5 §5.7)
--   - notifications internes avec lien profond vers l'objet
--   - clé d'idempotence (dedupe_key) pour éviter les doublons (§5.7 / §2.3)
--   - état de lecture (read_at) ; écritures via backend service_role uniquement
-- Idempotent.
-- ============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  entity text,
  entity_id text,
  link text,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Idempotence (§5.7 : « Éviter les doublons grâce à une clé d'idempotence »)
create unique index if not exists notifications_user_dedupe_uidx
  on public.notifications (user_id, dedupe_key);
create index if not exists notifications_user_inbox_idx
  on public.notifications (user_id, read_at, created_at desc);
create index if not exists notifications_tenant_idx
  on public.notifications (tenant_id);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select using (
  user_id = auth.uid()
);
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update using (
  user_id = auth.uid()
) with check (user_id = auth.uid());
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete using (
  user_id = auth.uid()
);

grant select, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
grant all on public.notifications to postgres;
