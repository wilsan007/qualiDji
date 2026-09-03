-- ============================================================================
-- Migration 0009: Internal audits — program, checklists, findings, reports
-- ============================================================================
-- Domain H: Audits internes
-- Tables: audit_programs, audit_cycles, audit_checklists, audit_checklist_items,
--         audit_findings, audit_reports
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type audit_type as enum ('internal', 'supplier', 'follow_up', 'surveillance');
create type audit_status as enum ('planned', 'scheduled', 'in_progress', 'reporting', 'completed', 'cancelled');
create type finding_type as enum ('conformity', 'minor_nc', 'major_nc', 'observation', 'opportunity');
create type finding_status as enum ('open', 'nc_created', 'closed');

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.audit_programs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  year integer not null,
  description text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, year)
);

create table public.audit_cycles (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  program_id uuid references public.audit_programs(id) on delete cascade,
  audit_number text not null,      -- e.g. 'AI-2024-001'
  title text not null,
  type audit_type not null default 'internal',
  status audit_status not null default 'planned',
  site_id uuid references public.sites(id) on delete set null,
  process text,
  scope text not null,             -- what is being audited
  objectives text,
  criteria text[],                 -- ISO clauses, procedures, etc.
  lead_auditor_id uuid not null references auth.users(id),
  auditor_ids uuid[] not null default '{}'::uuid[],  -- team members
  auditee_ids uuid[] not null default '{}'::uuid[],  -- people being audited
  scheduled_date date,
  start_date date,
  end_date date,
  report_due_date date,
  report_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, audit_number)
);

create table public.audit_checklists (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cycle_id uuid not null references public.audit_cycles(id) on delete cascade,
  name text not null,
  auditor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.audit_checklist_items (
  id uuid primary key default uuid_generate_v4(),
  checklist_id uuid not null references public.audit_checklists(id) on delete cascade,
  requirement_id uuid references public.requirements(id) on delete set null,
  clause_ref text,                 -- e.g. '8.5.1'
  question text not null,
  expected_evidence text,
  finding_type finding_type,       -- set during audit
  finding_notes text,
  evidence_id uuid references public.evidence(id) on delete set null,
  nc_id uuid references public.nonconformities(id) on delete set null,  -- if NC created
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.audit_findings (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cycle_id uuid not null references public.audit_cycles(id) on delete cascade,
  checklist_item_id uuid references public.audit_checklist_items(id) on delete set null,
  finding_number text not null,    -- e.g. 'F-001'
  type finding_type not null,
  description text not null,
  clause_ref text,
  severity nc_severity,            -- for NCs
  recommendation text,
  nc_id uuid references public.nonconformities(id) on delete set null,
  status finding_status not null default 'open',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_reports (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cycle_id uuid not null references public.audit_cycles(id) on delete cascade,
  executive_summary text not null,
  scope_confirmed text,
  objectives_met boolean,
  strengths text[],                -- positive findings
  weaknesses text[],               -- areas for improvement
  conclusions text,
  recommendations text[],
  overall_rating text,             -- 'excellent', 'good', 'satisfactory', 'needs_improvement'
  report_date date not null default current_date,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  distribution_list uuid[] not null default '{}'::uuid[],
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cycle_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_audit_programs_tenant on public.audit_programs(tenant_id);
create index idx_audit_cycles_tenant on public.audit_cycles(tenant_id);
create index idx_audit_cycles_status on public.audit_cycles(status);
create index idx_audit_cycles_lead on public.audit_cycles(lead_auditor_id);
create index idx_audit_checklists_cycle on public.audit_checklists(cycle_id);
create index idx_audit_checklist_items_checklist on public.audit_checklist_items(checklist_id);
create index idx_audit_findings_cycle on public.audit_findings(cycle_id);
create index idx_audit_findings_status on public.audit_findings(status);
create index idx_audit_reports_cycle on public.audit_reports(cycle_id);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.audit_programs enable row level security;
alter table public.audit_cycles enable row level security;
alter table public.audit_checklists enable row level security;
alter table public.audit_checklist_items enable row level security;
alter table public.audit_findings enable row level security;
alter table public.audit_reports enable row level security;

-- Audit programs: all tenant users can see; quality roles manage
create policy audit_programs_select on public.audit_programs
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy audit_programs_insert on public.audit_programs
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'internal_auditor', 'super_admin'])
  );

create policy audit_programs_update on public.audit_programs
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy audit_programs_delete on public.audit_programs
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Audit cycles: all tenant users can see; auditors and quality manage
create policy audit_cycles_select on public.audit_cycles
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy audit_cycles_insert on public.audit_cycles
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'internal_auditor', 'super_admin'])
  );

create policy audit_cycles_update on public.audit_cycles
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      lead_auditor_id = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  )
  with check (tenant_id = public.current_tenant_id());

create policy audit_cycles_delete on public.audit_cycles
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Audit checklists: auditors and quality
create policy audit_checklists_select on public.audit_checklists
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      auditor_id = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
      or exists (
        select 1 from public.audit_cycles c
        where c.id = audit_checklists.cycle_id
          and (select auth.uid()) = any(c.auditor_ids)
      )
    )
  );

create policy audit_checklists_insert on public.audit_checklists
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and (
      auditor_id = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  );

create policy audit_checklists_delete on public.audit_checklists
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      auditor_id = (select auth.uid())
      or public.has_role(array['tenant_admin', 'super_admin'])
    )
  );

-- Audit checklist items: via checklist access
create policy audit_checklist_items_select on public.audit_checklist_items
  for select to authenticated
  using (
    exists (
      select 1 from public.audit_checklists c
      where c.id = audit_checklist_items.checklist_id
        and c.tenant_id = public.current_tenant_id()
    )
  );

create policy audit_checklist_items_insert on public.audit_checklist_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.audit_checklists c
      where c.id = audit_checklist_items.checklist_id
        and c.tenant_id = public.current_tenant_id()
        and (
          c.auditor_id = (select auth.uid())
          or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
        )
    )
  );

create policy audit_checklist_items_update on public.audit_checklist_items
  for update to authenticated
  using (
    exists (
      select 1 from public.audit_checklists c
      where c.id = audit_checklist_items.checklist_id
        and c.tenant_id = public.current_tenant_id()
        and (
          c.auditor_id = (select auth.uid())
          or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
        )
    )
  );

create policy audit_checklist_items_delete on public.audit_checklist_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.audit_checklists c
      where c.id = audit_checklist_items.checklist_id
        and c.tenant_id = public.current_tenant_id()
        and (
          c.auditor_id = (select auth.uid())
          or public.has_role(array['tenant_admin', 'super_admin'])
        )
    )
  );

-- Audit findings: all tenant users can see; auditors manage
create policy audit_findings_select on public.audit_findings
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy audit_findings_insert on public.audit_findings
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'internal_auditor', 'super_admin'])
  );

create policy audit_findings_update on public.audit_findings
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      created_by = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  )
  with check (tenant_id = public.current_tenant_id());

create policy audit_findings_delete on public.audit_findings
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Audit reports: all tenant users can see; lead auditor and quality manage
create policy audit_reports_select on public.audit_reports
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy audit_reports_insert on public.audit_reports
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'internal_auditor', 'super_admin'])
  );

create policy audit_reports_update on public.audit_reports
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      created_by = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  )
  with check (tenant_id = public.current_tenant_id());

create policy audit_reports_delete on public.audit_reports
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

create trigger trg_audit_programs_updated_at
  before update on public.audit_programs
  for each row execute function public.set_updated_at();

create trigger trg_audit_cycles_updated_at
  before update on public.audit_cycles
  for each row execute function public.set_updated_at();

create trigger trg_audit_findings_updated_at
  before update on public.audit_findings
  for each row execute function public.set_updated_at();

create trigger trg_audit_reports_updated_at
  before update on public.audit_reports
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: Generate audit number
-- ============================================================================

create or replace function public.generate_audit_number(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_year text;
begin
  v_year := extract(year from now())::text;

  select count(*) + 1 into v_count
  from public.audit_cycles
  where tenant_id = p_tenant_id
    and extract(year from created_at) = extract(year from now());

  return 'AI-' || v_year || '-' || lpad(v_count::text, 3, '0');
end;
$$;

-- ============================================================================
-- TRIGGER: Notify auditors when audit is scheduled
-- ============================================================================

create or replace function public.on_audit_scheduled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Notify lead auditor
  perform public.create_notification(
    new.tenant_id,
    new.lead_auditor_id,
    'system',
    'Audit planifié: ' || new.audit_number,
    'Vous êtes désigné comme auditeur principal: ' || new.title,
    '/tenant/audits/' || new.id,
    'Voir l''audit',
    'high'
  );

  -- Notify auditees
  perform public.create_notification(
    new.tenant_id,
    auditee_id,
    'system',
    'Audit planifié: ' || new.audit_number,
    'Un audit est planifié et vous êtes concerné: ' || new.title,
    '/tenant/audits/' || new.id,
    'Voir l''audit',
    'normal'
  )
  from unnest(new.auditee_ids) as auditee_id;

  return new;
end;
$$;

create trigger trg_on_audit_scheduled
  after insert on public.audit_cycles
  for each row
  execute function public.on_audit_scheduled();
