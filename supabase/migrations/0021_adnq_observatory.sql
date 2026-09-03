-- ============================================================================
-- Migration 0021: ADNQ observatory, national statistics, partnerships
-- ============================================================================
-- Sprint 24: Lancement et observatoire
-- Tables: national_statistics, adnq_partners, partner_offers,
--         maturity_assessments, public_badges
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type partner_type as enum ('adnq', 'formateur', 'certification_body', 'institutional', 'technology');

create type badge_type as enum (
  'iso9001_certified', 'iso22000_certified', 'quality_champion',
  'audit_ready', 'haccp_verified', 'early_adopter'
);

create type maturity_dimension as enum (
  'leadership', 'planning', 'support', 'operation', 'performance', 'improvement'
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- Aggregated, anonymized national statistics (for ADNQ observatory)
create table public.national_statistics (
  id uuid primary key default uuid_generate_v4(),
  period_year integer not null,
  period_month integer,             -- null = annual aggregate
  -- Sector breakdown
  sector text,                      -- 'import', 'restaurant', 'port', 'telecom', 'banking', 'other'
  -- Metrics (anonymized aggregates)
  total_organizations integer not null default 0,
  total_certified_9001 integer not null default 0,
  total_certified_22000 integer not null default 0,
  avg_compliance_score numeric not null default 0,
  avg_maturity_level numeric not null default 0,
  total_audits_completed integer not null default 0,
  total_ncs_resolved integer not null default 0,
  total_training_hours integer not null default 0,
  -- Metadata
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(period_year, period_month, sector)
);

-- ADNQ and other institutional partners
create table public.adnq_partners (
  id uuid primary key default uuid_generate_v4(),
  type partner_type not null,
  name text not null,
  name_fr text,
  name_en text,
  name_ar text,
  name_so text,
  description text,
  logo_url text,
  website_url text,
  contact_email text,
  contact_phone text,
  -- Partnership details
  partnership_started_at date,
  partnership_terms text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partner co-branded offers (e.g. ADNQ Découverte offer)
create table public.partner_offers (
  id uuid primary key default uuid_generate_v4(),
  partner_id uuid not null references public.adnq_partners(id) on delete cascade,
  name text not null,
  description text,
  -- Discount
  discount_percentage numeric not null default 0,
  discount_amount numeric,
  -- Eligibility
  eligibility_criteria jsonb not null default '{}'::jsonb,
  -- Validity
  valid_from date,
  valid_until date,
  -- Co-branding
  co_branded_name text,
  co_branded_logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Maturity assessments (anonymized for national statistics)
create table public.maturity_assessments (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  dimension maturity_dimension not null,
  score numeric not null default 0 check (score between 0 and 100),
  -- Assessment details
  assessed_by uuid references auth.users(id) on delete set null,
  assessed_at timestamptz not null default now(),
  -- Context
  organization_size text,           -- 'tpe', 'pme', 'enterprise'
  sector text,
  -- Anonymized for national stats
  share_anonymized boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique(tenant_id, dimension)
);

-- Public quality badges (shareable certification status)
create table public.public_badges (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type badge_type not null,
  -- Badge details
  issued_at timestamptz not null default now(),
  issued_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  -- Verification
  verification_code text not null unique,  -- public verification code
  is_verified boolean not null default false,
  verified_at timestamptz,
  verified_by uuid,                -- external verifier (e.g. ADNQ)
  -- Public display
  is_public boolean not null default false,
  display_name text,               -- organization name to display
  display_logo_url text,
  -- Metadata
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_national_statistics_period on public.national_statistics(period_year, period_month);
create index idx_national_statistics_sector on public.national_statistics(sector);
create index idx_adnq_partners_type on public.adnq_partners(type);
create index idx_partner_offers_partner on public.partner_offers(partner_id);
create index idx_maturity_assessments_tenant on public.maturity_assessments(tenant_id);
create index idx_maturity_assessments_dimension on public.maturity_assessments(dimension);
create index idx_public_badges_tenant on public.public_badges(tenant_id);
create index idx_public_badges_type on public.public_badges(type);
create index idx_public_badges_code on public.public_badges(verification_code);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.national_statistics enable row level security;
alter table public.adnq_partners enable row level security;
alter table public.partner_offers enable row level security;
alter table public.maturity_assessments enable row level security;
alter table public.public_badges enable row level security;

-- National statistics: public read, super_admin write
create policy national_statistics_select on public.national_statistics
  for select to authenticated
  using (true);

create policy national_statistics_insert on public.national_statistics
  for insert to authenticated
  with check (public.has_role(array['super_admin']));

create policy national_statistics_update on public.national_statistics
  for update to authenticated
  using (public.has_role(array['super_admin']));

-- ADNQ partners: public read, super_admin write
create policy adnq_partners_select on public.adnq_partners
  for select to authenticated
  using (is_active = true);

create policy adnq_partners_insert on public.adnq_partners
  for insert to authenticated
  with check (public.has_role(array['super_admin']));

create policy adnq_partners_update on public.adnq_partners
  for update to authenticated
  using (public.has_role(array['super_admin']));

-- Partner offers: public read
create policy partner_offers_select on public.partner_offers
  for select to authenticated
  using (is_active = true);

create policy partner_offers_insert on public.partner_offers
  for insert to authenticated
  with check (public.has_role(array['super_admin']));

create policy partner_offers_update on public.partner_offers
  for update to authenticated
  using (public.has_role(array['super_admin']));

-- Maturity assessments: tenant can see own, super_admin can see all
create policy maturity_assessments_select on public.maturity_assessments
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    or (share_anonymized = true and public.has_role(array['super_admin']))
  );

create policy maturity_assessments_insert on public.maturity_assessments
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy maturity_assessments_update on public.maturity_assessments
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy maturity_assessments_delete on public.maturity_assessments
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Public badges: public read for verified+public, tenant manages own
create policy public_badges_select on public.public_badges
  for select to authenticated
  using (
    (is_public = true and is_verified = true)
    or tenant_id = public.current_tenant_id()
  );

create policy public_badges_insert on public.public_badges
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy public_badges_update on public.public_badges
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy public_badges_delete on public.public_badges
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

create trigger trg_adnq_partners_updated_at
  before update on public.adnq_partners
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: Aggregate national statistics (run monthly via pg_cron)
-- ============================================================================

create or replace function public.aggregate_national_statistics(
  p_year integer default extract(year from now())::integer,
  p_month integer default extract(month from now())::integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sector text;
  v_total_orgs integer;
  v_certified_9001 integer;
  v_certified_22000 integer;
  v_avg_compliance numeric;
  v_avg_maturity numeric;
  v_total_audits integer;
  v_total_ncs integer;
  v_total_training integer;
begin
  -- For each sector, aggregate anonymized stats
  for v_sector in select distinct coalesce(nullif(split_part(name, '-', 1), ''), 'other') from public.tenants loop
    -- Count organizations
    select count(*) into v_total_orgs
    from public.tenants t
    where t.is_active = true;

    -- Count certified (simplified — in production would check actual certifications)
    select count(*) into v_certified_9001
    from public.tenants t
    where t.is_active = true
      and exists (
        select 1 from public.assessments a
        join public.standards s on s.id = a.standard_id
        where a.tenant_id = t.id and s.code = 'ISO 9001:2015'
          and a.compliance_score >= 90
      );

    -- Average compliance score
    select coalesce(avg(a.compliance_score), 0) into v_avg_compliance
    from public.assessments a
    join public.tenants t on t.id = a.tenant_id
    where t.is_active = true;

    -- Average maturity
    select coalesce(avg(score), 0) into v_avg_maturity
    from public.maturity_assessments
    where share_anonymized = true;

    -- Total audits
    select count(*) into v_total_audits
    from public.audits a
    join public.tenants t on t.id = a.tenant_id
    where t.is_active = true
      and a.status = 'completed'
      and extract(year from a.completed_at) = p_year
      and extract(month from a.completed_at) = p_month;

    -- Total NCs resolved
    select count(*) into v_total_ncs
    from public.nonconformities nc
    join public.tenants t on t.id = nc.tenant_id
    where t.is_active = true
      and nc.status = 'closed'
      and extract(year from nc.updated_at) = p_year
      and extract(month from nc.updated_at) = p_month;

    -- Total training hours
    select coalesce(sum(t.duration_hours), 0) into v_total_training
    from public.trainings t
    join public.tenants tn on tn.id = t.tenant_id
    where tn.is_active = true;

    -- Upsert
    insert into public.national_statistics (
      period_year, period_month, sector,
      total_organizations, total_certified_9001, total_certified_22000,
      avg_compliance_score, avg_maturity_level,
      total_audits_completed, total_ncs_resolved, total_training_hours,
      computed_at
    )
    values (
      p_year, p_month, v_sector,
      v_total_orgs, v_certified_9001, 0,
      v_avg_compliance, v_avg_maturity,
      v_total_audits, v_total_ncs, v_total_training,
      now()
    )
    on conflict (period_year, period_month, sector)
    do update set
      total_organizations = excluded.total_organizations,
      total_certified_9001 = excluded.total_certified_9001,
      avg_compliance_score = excluded.avg_compliance_score,
      avg_maturity_level = excluded.avg_maturity_level,
      total_audits_completed = excluded.total_audits_completed,
      total_ncs_resolved = excluded.total_ncs_resolved,
      total_training_hours = excluded.total_training_hours,
      computed_at = now();
  end loop;
end;
$$;

-- ============================================================================
-- SEED: ADNQ partner
-- ============================================================================

insert into public.adnq_partners (type, name, name_fr, name_en, name_ar, name_so, description, website_url, contact_email, partnership_started_at, partnership_terms) values
(
  'adnq',
  'ADNQ',
  'Association Djiboutienne pour la Normalisation et la Qualité',
  'Djiboutian Association for Standardization and Quality',
  'الجمعية الجيبوتية للتقييس والجودة',
  'Ururka Jabuuti ee Caadooyinka iyo Tayada',
  'Membre correspondant de l''ISO à Djibouti. Partenaire institutionnel pour la promotion de la qualité et la co-branding de l''offre Découverte.',
  'https://adnq.dj',
  'contact@adnq.dj',
  current_date,
  'Offre Découverte co-brandée; observatoire national de maturité qualité; espace partenaire pour formateurs agréés.'
);

-- ============================================================================
-- SEED: Partner offer (ADNQ Découverte)
-- ============================================================================

insert into public.partner_offers (partner_id, name, description, discount_percentage, valid_from, co_branded_name, is_active) values
(
  (select id from public.adnq_partners where type = 'adnq' limit 1),
  'Offre Découverte ADNQ',
  'Gratuit pour les organisations recommandées par l''ADNQ. Inclut diagnostic, exigences et tâches.',
  100,
  current_date,
  'QualiDji × ADNQ — Découverte',
  true
);
