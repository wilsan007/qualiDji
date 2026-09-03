-- ============================================================================
-- Migration 0002: Requirements engine — standards, clauses, requirements
-- ============================================================================
-- Domain B: Référentiels et conformité
-- Tables: standards, clauses, requirements, tenant_standards,
--         tenant_requirements, requirement_links, certificates,
--         roadmap_templates, roadmap_steps
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type standard_mode as enum ('implementation', 'maintenance');
create type evidence_level as enum ('0', '1', '2', '3', '4', '5');

-- ============================================================================
-- TABLES — Editor data (read-only for tenants)
-- ============================================================================

-- Standards (ISO 9001:2015, ISO 22000:2018, etc.)
create table public.standards (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,  -- e.g. 'ISO9001_2015', 'ISO22000_2018'
  name text not null,
  version text not null,
  lang text not null default 'fr',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Clauses (hierarchical: chapters → sub-clauses)
create table public.clauses (
  id uuid primary key default uuid_generate_v4(),
  standard_id uuid not null references public.standards(id) on delete cascade,
  parent_id uuid references public.clauses(id) on delete cascade,
  number text not null,          -- e.g. '4', '4.1', '8.5.1'
  title text not null,
  title_en text,
  title_ar text,
  title_so text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Requirements (atomic, ~250 for ISO 9001, ~300 for ISO 22000)
create table public.requirements (
  id uuid primary key default uuid_generate_v4(),
  clause_id uuid not null references public.clauses(id) on delete cascade,
  code text not null,            -- e.g. '9001-8.5.1-a'
  statement text not null,       -- plain language statement
  statement_en text,
  statement_ar text,
  statement_so text,
  explain_novice text,           -- explanation for beginners
  explain_novice_en text,
  explain_novice_ar text,
  explain_novice_so text,
  explain_intermediate text,     -- explanation for intermediate users
  explain_intermediate_en text,
  explain_intermediate_ar text,
  explain_intermediate_so text,
  explain_expert text,           -- explanation for experts
  explain_expert_en text,
  explain_expert_ar text,
  explain_expert_so text,
  expected_evidence jsonb not null default '[]'::jsonb,  -- array of evidence descriptions
  default_period interval,       -- e.g. '1 day', '1 week', '6 months', '1 year'
  default_role user_role default 'quality_manager',
  doc_templates uuid[] not null default '{}'::uuid[],    -- linked document template IDs
  is_mandatory_doc boolean not null default false,
  is_mandatory_record boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- TABLES — Tenant-specific compliance data
-- ============================================================================

-- Which standards a tenant has activated
create table public.tenant_standards (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  standard_id uuid not null references public.standards(id),
  mode standard_mode not null default 'implementation',
  scope_sites uuid[] not null default '{}'::uuid[],
  target_date date,
  certificate_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, standard_id)
);

-- Per-tenant configuration of each requirement
create table public.tenant_requirements (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requirement_id uuid not null references public.requirements(id),
  applicable boolean not null default true,
  justification text,            -- required if not applicable (exclusion)
  owner_id uuid references auth.users(id),
  period_override interval,      -- overrides default_period
  evidence_level_min evidence_level not null default '1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, requirement_id)
);

-- Links between requirements and compliance objects (documents, records, tasks, etc.)
-- This is what powers the compliance score and the evidence dossier
create table public.requirement_links (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requirement_id uuid not null references public.requirements(id),
  entity_type text not null,     -- 'document', 'record', 'task', 'audit', 'action', 'training'
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique(tenant_id, requirement_id, entity_type, entity_id)
);

-- Certificates obtained by tenant
create table public.certificates (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  standard_id uuid not null references public.standards(id),
  body text not null,            -- certification body (Bureau Veritas, SGS, etc.)
  number text not null,
  issued_at date not null,
  expires_at date not null,
  file_id uuid,                  -- reference to storage
  surveillance_dates date[] not null default '{}'::date[],
  created_at timestamptz not null default now()
);

-- ============================================================================
-- TABLES — Implementation roadmaps
-- ============================================================================

-- Roadmap templates (editor data, per standard + company size + sector)
create table public.roadmap_templates (
  id text primary key,
  standard_id uuid not null references public.standards(id),
  size_band text not null,       -- 'tpe', 'pme', 'ge'
  sector text,                   -- 'food', 'logistics', 'services', 'health', etc.
  name text not null,
  created_at timestamptz not null default now()
);

-- Roadmap steps (10 steps, ~60 sub-steps total)
create table public.roadmap_steps (
  id uuid primary key default uuid_generate_v4(),
  template_id text not null references public.roadmap_templates(id) on delete cascade,
  sort_order integer not null default 0,
  title text not null,
  title_en text,
  title_ar text,
  title_so text,
  description text,
  description_en text,
  description_ar text,
  description_so text,
  week_offset integer not null default 0,  -- which week this step starts
  requirement_ids uuid[] not null default '{}'::uuid[],
  deliverable_type text,         -- 'document', 'record', 'training', 'audit', etc.
  created_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_clauses_standard on public.clauses(standard_id);
create index idx_clauses_parent on public.clauses(parent_id);
create index idx_clauses_number on public.clauses(standard_id, number);
create index idx_requirements_clause on public.requirements(clause_id);
create index idx_requirements_code on public.requirements(code);
create index idx_tenant_standards_tenant on public.tenant_standards(tenant_id);
create index idx_tenant_requirements_tenant on public.tenant_requirements(tenant_id);
create index idx_tenant_requirements_requirement on public.tenant_requirements(requirement_id);
create index idx_requirement_links_tenant on public.requirement_links(tenant_id);
create index idx_requirement_links_requirement on public.requirement_links(requirement_id);
create index idx_requirement_links_entity on public.requirement_links(entity_type, entity_id);
create index idx_certificates_tenant on public.certificates(tenant_id);
create index idx_roadmap_steps_template on public.roadmap_steps(template_id);

-- ============================================================================
-- RLS
-- ============================================================================

-- Standards, clauses, requirements: editor data, readable by all authenticated
alter table public.standards enable row level security;
alter table public.clauses enable row level security;
alter table public.requirements enable row level security;

create policy standards_select on public.standards
  for select to authenticated using (true);

create policy clauses_select on public.clauses
  for select to authenticated using (true);

create policy requirements_select on public.requirements
  for select to authenticated using (true);

-- Roadmap templates and steps: editor data, readable by all
alter table public.roadmap_templates enable row level security;
alter table public.roadmap_steps enable row level security;

create policy roadmap_templates_select on public.roadmap_templates
  for select to authenticated using (true);

create policy roadmap_steps_select on public.roadmap_steps
  for select to authenticated using (true);

-- Tenant standards: filtered by tenant
alter table public.tenant_standards enable row level security;

create policy tenant_standards_select on public.tenant_standards
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy tenant_standards_insert on public.tenant_standards
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy tenant_standards_update on public.tenant_standards
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy tenant_standards_delete on public.tenant_standards
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Tenant requirements: filtered by tenant
alter table public.tenant_requirements enable row level security;

create policy tenant_requirements_select on public.tenant_requirements
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy tenant_requirements_insert on public.tenant_requirements
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy tenant_requirements_update on public.tenant_requirements
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy tenant_requirements_delete on public.tenant_requirements
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Requirement links: filtered by tenant
alter table public.requirement_links enable row level security;

create policy requirement_links_select on public.requirement_links
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy requirement_links_insert on public.requirement_links
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy requirement_links_delete on public.requirement_links
  for delete to authenticated
  using (tenant_id = public.current_tenant_id());

-- Certificates: filtered by tenant
alter table public.certificates enable row level security;

create policy certificates_select on public.certificates
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy certificates_insert on public.certificates
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy certificates_update on public.certificates
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy certificates_delete on public.certificates
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- ============================================================================
-- UPDATED_AT triggers
-- ============================================================================

create trigger trg_tenant_standards_updated_at
  before update on public.tenant_standards
  for each row execute function public.set_updated_at();

create trigger trg_tenant_requirements_updated_at
  before update on public.tenant_requirements
  for each row execute function public.set_updated_at();
