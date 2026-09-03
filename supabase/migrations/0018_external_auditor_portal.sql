-- ============================================================================
-- Migration 0018: External auditor portal
-- ============================================================================
-- Sprint 21: Portail auditeur externe
-- Tables: external_auditors, audit_windows, auditor_notes,
--         evidence_requests, auditor_access_log
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type audit_window_status as enum (
  'scheduled', 'active', 'evidence_review', 'reporting', 'completed', 'cancelled'
);

create type auditor_note_type as enum (
  'observation', 'finding', 'positive', 'opportunity', 'clarification'
);

create type auditor_note_severity as enum (
  'info', 'minor', 'major', 'critical'
);

create type evidence_request_status as enum (
  'pending', 'submitted', 'approved', 'rejected', 'overdue'
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- External auditor profiles (linked to auth.users but with auditor role)
create table public.external_auditors (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  organization text not null,       -- certification body (e.g. Bureau Veritas, SGS, TUV)
  accreditation text,               -- accreditation reference
  certificate_number text,          -- auditor certificate number
  specializations text[] not null default '{}'::text[],  -- ['iso9001', 'iso22000']
  languages text[] not null default '{fr}'::text[],
  is_active boolean not null default true,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- Audit windows: time-bound access for external auditors
create table public.audit_windows (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  auditor_id uuid not null references public.external_auditors(id) on delete cascade,
  standard_id uuid references public.standards(id) on delete set null,
  title text not null,
  scope text not null,              -- audit scope description
  audit_type text not null default 'surveillance',  -- initial, surveillance, recertification, special
  -- Timing
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Access scope
  accessible_modules text[] not null default '{}'::text[],  -- ['tasks', 'documents', 'audits', 'nc', 'evidence']
  -- Status
  status audit_window_status not null default 'scheduled',
  -- Report
  report_url text,
  report_submitted_at timestamptz,
  overall_result text,             -- 'conform', 'minor_nc', 'major_nc', 'critical_nc'
  recommendation text,             -- 'certify', 'maintain', 'recertify', 'suspend', 'withdraw'
  -- Metadata
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auditor notes: findings and observations during audit
create table public.auditor_notes (
  id uuid primary key default uuid_generate_v4(),
  audit_window_id uuid not null references public.audit_windows(id) on delete cascade,
  requirement_id uuid references public.requirements(id) on delete set null,
  type auditor_note_type not null default 'observation',
  severity auditor_note_severity not null default 'info',
  title text not null,
  description text not null,
  clause_reference text,           -- e.g. '8.5.1.a'
  -- Linked entities
  linked_nc_id uuid references public.nonconformities(id) on delete set null,
  -- Evidence
  evidence_reviewed text[],        -- evidence IDs reviewed
  -- Status
  is_resolved boolean not null default false,
  resolved_at timestamptz,
  -- Auditor
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Evidence requests: auditor requests specific evidence from tenant
create table public.evidence_requests (
  id uuid primary key default uuid_generate_v4(),
  audit_window_id uuid not null references public.audit_windows(id) on delete cascade,
  requirement_id uuid references public.requirements(id) on delete set null,
  requested_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  deadline timestamptz,
  -- Response
  status evidence_request_status not null default 'pending',
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  submitted_evidence_ids uuid[] not null default '{}'::uuid[],
  reviewer_notes text,
  reviewed_at timestamptz,
  -- Priority
  priority text not null default 'normal',  -- low, normal, high, urgent
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Access log: track all auditor actions for security
create table public.auditor_access_log (
  id uuid primary key default uuid_generate_v4(),
  audit_window_id uuid references public.audit_windows(id) on delete cascade,
  auditor_id uuid not null references public.external_auditors(id) on delete cascade,
  action text not null,            -- 'view', 'download', 'note', 'request', 'report'
  resource_type text,              -- 'document', 'evidence', 'task', 'nc'
  resource_id uuid,
  ip_address text,
  user_agent text,
  accessed_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_external_auditors_user on public.external_auditors(user_id);
create index idx_external_auditors_org on public.external_auditors(organization);
create index idx_audit_windows_tenant on public.audit_windows(tenant_id);
create index idx_audit_windows_auditor on public.audit_windows(auditor_id);
create index idx_audit_windows_status on public.audit_windows(status);
create index idx_audit_windows_dates on public.audit_windows(starts_at, ends_at);
create index idx_auditor_notes_window on public.auditor_notes(audit_window_id);
create index idx_evidence_requests_window on public.evidence_requests(audit_window_id);
create index idx_evidence_requests_status on public.evidence_requests(status);
create index idx_auditor_access_log_window on public.auditor_access_log(audit_window_id);
create index idx_auditor_access_log_auditor on public.auditor_access_log(auditor_id);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.external_auditors enable row level security;
alter table public.audit_windows enable row level security;
alter table public.auditor_notes enable row level security;
alter table public.evidence_requests enable row level security;
alter table public.auditor_access_log enable row level security;

-- External auditors: self can see own profile, tenant admins can see auditors auditing them
create policy external_auditors_select on public.external_auditors
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or is_active = true
  );

create policy external_auditors_insert on public.external_auditors
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy external_auditors_update on public.external_auditors
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Audit windows: tenant users and assigned auditor can see
create policy audit_windows_select on public.audit_windows
  for select to authenticated
  using (
    (
      tenant_id = public.current_tenant_id()
      and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
    or (
      auditor_id in (
        select id from public.external_auditors where user_id = (select auth.uid())
      )
    )
  );

create policy audit_windows_insert on public.audit_windows
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy audit_windows_update on public.audit_windows
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy audit_windows_delete on public.audit_windows
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Auditor notes: via audit window access
create policy auditor_notes_select on public.auditor_notes
  for select to authenticated
  using (
    exists (
      select 1 from public.audit_windows aw
      where aw.id = auditor_notes.audit_window_id
        and (
          (aw.tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin']))
          or (aw.auditor_id in (select id from public.external_auditors where user_id = (select auth.uid())))
        )
    )
  );

create policy auditor_notes_insert on public.auditor_notes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.audit_windows aw
      where aw.id = auditor_notes.audit_window_id
        and aw.auditor_id in (select id from public.external_auditors where user_id = (select auth.uid()))
    )
  );

create policy auditor_notes_update on public.auditor_notes
  for update to authenticated
  using (
    exists (
      select 1 from public.audit_windows aw
      where aw.id = auditor_notes.audit_window_id
        and aw.auditor_id in (select id from public.external_auditors where user_id = (select auth.uid()))
    )
  );

create policy auditor_notes_delete on public.auditor_notes
  for delete to authenticated
  using (
    exists (
      select 1 from public.audit_windows aw
      where aw.id = auditor_notes.audit_window_id
        and aw.auditor_id in (select id from public.external_auditors where user_id = (select auth.uid()))
    )
  );

-- Evidence requests: both tenant and auditor can see
create policy evidence_requests_select on public.evidence_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.audit_windows aw
      where aw.id = evidence_requests.audit_window_id
        and (
          (aw.tenant_id = public.current_tenant_id())
          or (aw.auditor_id in (select id from public.external_auditors where user_id = (select auth.uid())))
        )
    )
  );

create policy evidence_requests_insert on public.evidence_requests
  for insert to authenticated
  with check (
    exists (
      select 1 from public.audit_windows aw
      where aw.id = evidence_requests.audit_window_id
        and (
          (aw.tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin']))
          or (aw.auditor_id in (select id from public.external_auditors where user_id = (select auth.uid())))
        )
    )
  );

create policy evidence_requests_update on public.evidence_requests
  for update to authenticated
  using (
    exists (
      select 1 from public.audit_windows aw
      where aw.id = evidence_requests.audit_window_id
        and (
          (aw.tenant_id = public.current_tenant_id())
          or (aw.auditor_id in (select id from public.external_auditors where user_id = (select auth.uid())))
        )
    )
  );

-- Access log: only tenant admins and the auditor can see
create policy auditor_access_log_select on public.auditor_access_log
  for select to authenticated
  using (
    exists (
      select 1 from public.audit_windows aw
      where aw.id = auditor_access_log.audit_window_id
        and (
          (aw.tenant_id = public.current_tenant_id() and public.has_role(array['tenant_admin', 'super_admin']))
          or (aw.auditor_id in (select id from public.external_auditors where user_id = (select auth.uid())))
        )
    )
  );

create policy auditor_access_log_insert on public.auditor_access_log
  for insert to authenticated
  with check (
    auditor_id in (select id from public.external_auditors where user_id = (select auth.uid()))
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

create trigger trg_external_auditors_updated_at
  before update on public.external_auditors
  for each row execute function public.set_updated_at();

create trigger trg_audit_windows_updated_at
  before update on public.audit_windows
  for each row execute function public.set_updated_at();

create trigger trg_auditor_notes_updated_at
  before update on public.auditor_notes
  for each row execute function public.set_updated_at();

create trigger trg_evidence_requests_updated_at
  before update on public.evidence_requests
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: Auto-activate audit window when start time reached
-- ============================================================================

create or replace function public.check_audit_window_status(p_window_id uuid)
returns audit_window_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window record;
  v_new_status audit_window_status;
begin
  select * into v_window from public.audit_windows where id = p_window_id;
  if not found then return null; end if;

  if v_window.status in ('completed', 'cancelled') then
    return v_window.status;
  end if;

  if now() < v_window.starts_at then
    v_new_status := 'scheduled';
  elsif now() >= v_window.starts_at and now() <= v_window.ends_at then
    v_new_status := 'active';
  elsif now() > v_window.ends_at and v_window.report_url is null then
    v_new_status := 'reporting';
  end if;

  if v_new_status != v_window.status then
    update public.audit_windows set status = v_new_status where id = p_window_id;
  end if;

  return v_new_status;
end;
$$;

-- ============================================================================
-- FUNCTION: Notify tenant when evidence request is created
-- ============================================================================

create or replace function public.on_evidence_requested()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_auditor_name text;
begin
  select aw.tenant_id, ea.full_name into v_tenant_id, v_auditor_name
  from public.audit_windows aw
  join public.external_auditors ea on ea.id = aw.auditor_id
  where aw.id = new.audit_window_id;

  if not found then return new; end if;

  -- Notify quality manager
  perform public.create_notification(
    v_tenant_id,
    null,
    'audit',
    'Demande de preuve de l''auditeur',
    v_auditor_name || ' a demandé: ' || new.title,
    '/tenant/external-audit',
    'Voir la demande',
    case when new.priority = 'urgent' then 'urgent' else 'high' end
  );

  return new;
end;
$$;

create trigger trg_on_evidence_requested
  after insert on public.evidence_requests
  for each row
  execute function public.on_evidence_requested();
