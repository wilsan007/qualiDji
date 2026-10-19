-- ============================================================================
-- Migration 0002: Registre d'exigences + matrice de traçabilité
-- Cahier des charges V4 — Annexes K (5 étapes) et L (matrice de traçabilité),
-- modèle de données §10 (requirements / workflow_requirement_map).
-- Principe: le catalogue `requirements` est global (comme workflow_definitions,
-- aucun contenu client), les décisions par organisation (applicabilité,
-- justifications, résultats de tests, validations) sont strictement tenant.
-- ============================================================================

-- 1) Catalogue global des exigences ISO 9001:2026 (étapes K.1 / K.2) --------
create table public.requirements (
  id text primary key,                 -- ex. ISO9001-2026-7.2
  clause text not null check (clause in ('4', '5', '6', '7', '8', '9', '10')),
  title text not null,                 -- reformulation interne (annexe N)
  requirement_type text not null default 'requirement'
    check (requirement_type in ('requirement', 'note', 'annex_a', 'external_rule', 'internal_rule')),
  source_version text not null default 'ISO 9001:2026 (édition 6)',
  source_ref text not null,            -- référence paragraphe officiel (K.1: confirmer sur exemplaire autorisé)
  process_owner text,                  -- responsable (étape K.2)
  software_control text,               -- contrôle logiciel (étape K.2)
  objective_evidence text,             -- preuve attendue (étape K.2)
  verification_method text,            -- méthode de vérification (étape K.2)
  spaces text[] not null default '{}', -- C / P / AE (annexe N, L.2)
  status text not null default 'published' check (status in ('draft', 'published')),
  matrix_version int not null default 1,
  created_at timestamptz not null default now()
);
create index requirements_clause_idx on public.requirements (clause);

-- 2) Décisions par tenant: applicabilité / registre des non-applicabilités (K.4)
create table public.requirement_assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  requirement_id text not null references public.requirements (id) on delete cascade,
  applicability text not null default 'applicable'
    check (applicability in ('applicable', 'not_applicable', 'to_review')),
  na_justification text,               -- justification motivée (N.10)
  na_approved_by text,                 -- nom + fonction du validateur (K.4)
  na_approved_at timestamptz,
  last_reason text,                    -- motif de la dernière modification (L.5)
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  unique (tenant_id, requirement_id)
);
create index requirement_assessments_tenant_idx
  on public.requirement_assessments (tenant_id);

-- 3) Tests positif/négatif par exigence (étape K.3, convention MT-<réf>-POS/NEG)
create table public.requirement_tests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  requirement_id text not null references public.requirements (id) on delete cascade,
  kind text not null check (kind in ('positive', 'negative')),
  code text not null,                  -- MT-<réf>-POS ou MT-<réf>-NEG
  scenario text,
  status text not null default 'todo' check (status in ('todo', 'passed', 'failed')),
  notes text,
  executed_by uuid references auth.users (id),
  executed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (tenant_id, requirement_id, kind)
);
create index requirement_tests_tenant_idx on public.requirement_tests (tenant_id);

-- 4) Cartographie exigence <-> workflow (§10 workflow_requirement_map)

--    Pas de FK sur workflow_code: la plupart des workflows (annexe A) seront
--    créés ultérieurement; la carte précède leur instantiation.
create table public.workflow_requirement_map (
  workflow_code text not null,
  requirement_id text not null references public.requirements (id) on delete cascade,
  coverage_type text not null default 'primary' check (coverage_type in ('primary', 'supporting')),
  primary key (workflow_code, requirement_id)
);
create index workflow_requirement_map_req_idx
  on public.workflow_requirement_map (requirement_id);

-- 5) Validation par un spécialiste compétent (étape K.5 / L.3) ---------------
create table public.matrix_validations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  matrix_version int not null default 1,
  perimeter text not null,             -- ex. clause_4 … clause_10, space_C, space_P, space_AE
  expert_name text not null,
  expert_role text not null,
  competency_justification text not null,
  decision text not null check (decision in ('validated', 'validated_with_reserves', 'refused')),
  reserves text,
  decided_by uuid references auth.users (id),
  decided_at timestamptz not null default now(),
  unique (tenant_id, matrix_version, perimeter)
);
create index matrix_validations_tenant_idx on public.matrix_validations (tenant_id);

-- 6) RLS: catalogue en lecture, décisions isolées par tenant (§7.3) ----------
alter table public.requirements enable row level security;
alter table public.requirement_assessments enable row level security;
alter table public.requirement_tests enable row level security;
alter table public.workflow_requirement_map enable row level security;
alter table public.matrix_validations enable row level security;

-- Catalogue: lecture globale (aucune donnée client) — écritures service_role.
create policy requirements_read on public.requirements
  for select using (true);
create policy workflow_requirement_map_read on public.workflow_requirement_map
  for select using (true);

-- Décisions tenant: lecture réservée au tenant de l'utilisateur.
create policy requirement_assessments_tenant_read on public.requirement_assessments
  for select using (
    tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
  );
create policy requirement_tests_tenant_read on public.requirement_tests
  for select using (
    tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
  );
create policy matrix_validations_tenant_read on public.matrix_validations
  for select using (
    tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
  );

-- 7) Rôle consultant — espace 1 « consultant / accompagnement » (V4, annexe N.8)
do $$
declare
  con_name text;
begin
  select con.conname into con_name
  from pg_constraint con
  where con.conrelid = 'public.user_profiles'::regclass
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%quality_manager%';
  if con_name is not null then
    execute format('alter table public.user_profiles drop constraint %I', con_name);
  end if;
end $$;

alter table public.user_profiles add constraint user_profiles_role_check check (role in (
  'admin', 'quality_manager', 'site_manager', 'process_owner',
  'operator', 'internal_auditor', 'external_auditor', 'director', 'consultant'
));

-- 8) Auto-lecture du profil (le frontend lit directement user_profiles) ------
drop policy if exists user_profiles_self_select on public.user_profiles;
create policy user_profiles_self_select on public.user_profiles
  for select using (id = auth.uid());