-- ============================================================================
-- Migration 0020 : carte exigences <-> workflows PAR ENTREPRISE (étude
-- docs/ETUDE_CARTE_PAR_ENTREPRISE.md, option A « surcouche »)
--
--   La carte globale `workflow_requirement_map` (54 lignes, annexe N) reste le
--   catalogue de SUGGESTIONS, en lecture seule. Chaque entreprise y ajoute ses
--   liens (vers un workflow ou un module) et peut écarter une suggestion :
--     carte effective = suggestions − exclusions + liens de l'entreprise.
--
--   - kind = 'workflow'  : lien vers une famille de workflow (code racine, sans
--                          suffixe tenant ni version : WF_X couvre WF_X__ab12cd34_V2)
--   - kind = 'module'    : lien vers un module fonctionnel (audits, revues, NC/CAPA, documents)
--   - kind = 'exclusion' : suggestion globale écartée par l'entreprise
--   Motif obligatoire (traçabilité L.5). Un retrait n'efface rien (removed_at).
--   Aucun effet sur le statut de couverture : un lien manquant ne produit qu'un
--   AVERTISSEMENT côté API (décision produit du 29/10/2026), jamais une lacune bloquante.
--   Écritures exclusivement via le backend (service_role), cf. 0014.
-- Idempotent.
-- ============================================================================

create table if not exists public.tenant_requirement_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  requirement_id text not null references public.requirements (id) on delete cascade,
  kind text not null check (kind in ('workflow', 'module', 'exclusion')),
  workflow_family text check (workflow_family ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  module text check (module in ('audits', 'reviews', 'nonconformities', 'documents')),
  coverage_type text not null default 'primary' check (coverage_type in ('primary', 'supporting')),
  reason text not null check (length(btrim(reason)) >= 3),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid,
  removed_reason text,
  -- Une cible et une seule, cohérente avec le type de lien
  constraint tenant_requirement_links_target_chk check (
    (kind in ('workflow', 'exclusion') and workflow_family is not null and module is null)
    or (kind = 'module' and module is not null and workflow_family is null)
  ),
  -- Un lien retiré porte sa date, son auteur et son motif
  constraint tenant_requirement_links_removed_chk check (
    (removed_at is null and removed_by is null and removed_reason is null)
    or (removed_at is not null and removed_by is not null and length(btrim(coalesce(removed_reason, ''))) >= 3)
  )
);

-- Un seul lien ACTIF par (entreprise, exigence, type, cible) ; les liens retirés sont conservés
create unique index if not exists tenant_requirement_links_active_workflow_idx
  on public.tenant_requirement_links (tenant_id, requirement_id, kind, workflow_family)
  where removed_at is null and workflow_family is not null;
create unique index if not exists tenant_requirement_links_active_module_idx
  on public.tenant_requirement_links (tenant_id, requirement_id, module)
  where removed_at is null and module is not null;
create index if not exists tenant_requirement_links_tenant_idx
  on public.tenant_requirement_links (tenant_id, requirement_id);

-- RLS : lecture filtrée tenant ; écritures backend service_role (convention 0014)
alter table public.tenant_requirement_links enable row level security;

drop policy if exists tenant_requirement_links_tenant_select on public.tenant_requirement_links;
create policy tenant_requirement_links_tenant_select on public.tenant_requirement_links
  for select to authenticated using (
    tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
  );

-- Première table créée depuis 0014 : on ne dépend pas des privilèges par défaut de la plateforme
revoke all on public.tenant_requirement_links from anon, authenticated;
grant select on public.tenant_requirement_links to authenticated;
grant all on public.tenant_requirement_links to service_role;
grant all on public.tenant_requirement_links to postgres;

-- Garde-fou : RLS active et aucun droit d'écriture direct pour anon/authenticated
do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'tenant_requirement_links' and c.relrowsecurity
  ) then
    raise exception '0020 : RLS absente sur tenant_requirement_links';
  end if;
  if has_table_privilege('anon', 'public.tenant_requirement_links', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     or has_table_privilege('authenticated', 'public.tenant_requirement_links', 'INSERT,UPDATE,DELETE,TRUNCATE') then
    raise exception '0020 : privilèges résiduels anon/authenticated sur tenant_requirement_links';
  end if;
end $$;
