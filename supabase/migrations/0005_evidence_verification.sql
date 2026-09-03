-- ============================================================================
-- Migration 0005: Evidence capture, integrity, and verification
-- ============================================================================
-- Domain D: Preuves, anti-fraude, vérification
-- Tables: evidence, evidence_links, evidence_verifications,
--         anomaly_flags, signatures
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type evidence_type as enum (
  'photo', 'document', 'video', 'audio', 'form',
  'signature', 'sensor_data', 'barcode_scan', 'gps_check', 'third_party'
);

create type anomaly_type as enum (
  'rapid_completion', 'duplicate_photo', 'off_hours', 'location_mismatch',
  'reused_evidence', 'skipped_steps', 'unusual_pattern', 'manual_flag'
);

-- ============================================================================
-- TABLES — Evidence
-- ============================================================================

create table public.evidence (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  type evidence_type not null,
  -- Storage reference (Supabase Storage path)
  storage_path text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  -- Integrity
  file_hash text not null,        -- SHA-256 of the file content
  metadata jsonb not null default '{}'::jsonb,
  -- GPS and device info for field evidence
  location point,
  captured_at timestamptz not null default now(),
  -- Evidence level (N0-N5)
  level evidence_level not null default '1',
  -- Verification status
  is_verified boolean not null default false,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  -- Expiry (some evidence expires, e.g. calibration certificates)
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Link evidence to requirements (many-to-many)
create table public.evidence_links (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  evidence_id uuid not null references public.evidence(id) on delete cascade,
  requirement_id uuid not null references public.requirements(id),
  task_id uuid references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(tenant_id, evidence_id, requirement_id)
);

-- Evidence verification log (append-only)
create table public.evidence_verifications (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  evidence_id uuid not null references public.evidence(id) on delete cascade,
  verifier_id uuid not null references auth.users(id),
  -- Random sampling: was this evidence selected for random verification?
  is_random_sample boolean not null default false,
  -- Verification result
  is_authentic boolean not null,
  comment text,
  -- Integrity checks
  hash_verified boolean not null default false,
  metadata_verified boolean not null default false,
  location_verified boolean not null default false,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Anomaly detection flags
create table public.anomaly_flags (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type anomaly_type not null,
  entity_type text not null,       -- 'task', 'evidence', 'user'
  entity_id uuid not null,
  user_id uuid references auth.users(id),
  severity text not null default 'medium',  -- 'low', 'medium', 'high'
  description text,
  metadata jsonb not null default '{}'::jsonb,
  is_resolved boolean not null default false,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Digital signatures (for document approval, task completion)
create table public.signatures (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  entity_type text not null,       -- 'task', 'document', 'audit', 'nc'
  entity_id uuid not null,
  signature_data text,             -- base64 signature image or hash
  signature_hash text not null,    -- hash of the signed content
  signed_at timestamptz not null default now(),
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_evidence_tenant on public.evidence(tenant_id);
create index idx_evidence_task on public.evidence(task_id);
create index idx_evidence_uploaded_by on public.evidence(uploaded_by);
create index idx_evidence_hash on public.evidence(file_hash);
create index idx_evidence_links_evidence on public.evidence_links(evidence_id);
create index idx_evidence_links_requirement on public.evidence_links(requirement_id);
create index idx_evidence_verifications_evidence on public.evidence_verifications(evidence_id);
create index idx_anomaly_flags_tenant on public.anomaly_flags(tenant_id);
create index idx_anomaly_flags_entity on public.anomaly_flags(entity_type, entity_id);
create index idx_anomaly_flags_unresolved on public.anomaly_flags(tenant_id, is_resolved);
create index idx_signatures_entity on public.signatures(entity_type, entity_id);
create index idx_signatures_user on public.signatures(user_id);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.evidence enable row level security;
alter table public.evidence_links enable row level security;
alter table public.evidence_verifications enable row level security;
alter table public.anomaly_flags enable row level security;
alter table public.signatures enable row level security;

-- Evidence: uploader and managers can see
create policy evidence_select on public.evidence
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      uploaded_by = (select auth.uid())
      or public.has_role(array['super_admin', 'tenant_admin', 'director', 'quality_manager', 'process_owner', 'internal_auditor'])
    )
  );

create policy evidence_insert on public.evidence
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and uploaded_by = (select auth.uid())
  );

create policy evidence_delete on public.evidence
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

-- Evidence links: filtered by tenant
create policy evidence_links_select on public.evidence_links
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy evidence_links_insert on public.evidence_links
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy evidence_links_delete on public.evidence_links
  for delete to authenticated
  using (tenant_id = public.current_tenant_id());

-- Evidence verifications: verifiers and managers
create policy evidence_verifications_select on public.evidence_verifications
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      verifier_id = (select auth.uid())
      or public.has_role(array['super_admin', 'tenant_admin', 'quality_manager', 'internal_auditor'])
    )
  );

create policy evidence_verifications_insert on public.evidence_verifications
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['quality_manager', 'process_owner', 'internal_auditor', 'super_admin', 'tenant_admin'])
  );

-- Anomaly flags: managers and auditors
create policy anomaly_flags_select on public.anomaly_flags
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['super_admin', 'tenant_admin', 'quality_manager', 'internal_auditor'])
  );

create policy anomaly_flags_insert on public.anomaly_flags
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy anomaly_flags_update on public.anomaly_flags
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

-- Signatures: signer and managers
create policy signatures_select on public.signatures
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      user_id = (select auth.uid())
      or public.has_role(array['super_admin', 'tenant_admin', 'quality_manager', 'internal_auditor'])
    )
  );

create policy signatures_insert on public.signatures
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

-- ============================================================================
-- FUNCTION: detect_anomalies
-- ============================================================================
-- Detects behavioral anomalies in task completion and evidence submission.
-- Called after task completion or evidence upload.
-- ============================================================================

create or replace function public.detect_anomalies(
  p_tenant_id uuid,
  p_task_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
  v_completion_interval interval;
  v_avg_interval interval;
  v_evidence_count integer;
  v_duplicate_count integer;
  v_off_hours boolean;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then return; end if;

  -- Check 1: Rapid completion (< 10% of allocated time)
  if v_task.started_at is not null and v_task.submitted_at is not null then
    v_completion_interval := v_task.submitted_at - v_task.started_at;
    v_avg_interval := v_task.due_date - v_task.started_at;

    if v_avg_interval > interval '0' and v_completion_interval < (v_avg_interval * 0.1) then
      insert into public.anomaly_flags (tenant_id, type, entity_type, entity_id, user_id, severity, description)
      values (
        p_tenant_id, 'rapid_completion', 'task', p_task_id, p_user_id, 'medium',
        'Task completed in less than 10% of allocated time'
      );
    end if;
  end if;

  -- Check 2: Off-hours submission (before 6am or after 8pm)
  v_off_hours := extract(hour from now()) < 6 or extract(hour from now()) > 20;
  if v_off_hours then
    insert into public.anomaly_flags (tenant_id, type, entity_type, entity_id, user_id, severity, description)
    values (
      p_tenant_id, 'off_hours', 'task', p_task_id, p_user_id, 'low',
      'Task submitted outside normal working hours'
    );
  end if;

  -- Check 3: Duplicate evidence (same hash used for different tasks)
  select count(*) into v_duplicate_count
  from public.evidence e
  where e.tenant_id = p_tenant_id
    and e.task_id = p_task_id
    and e.file_hash in (
      select file_hash from public.evidence
      where tenant_id = p_tenant_id
      group by file_hash
      having count(*) > 1
    );

  if v_duplicate_count > 0 then
    insert into public.anomaly_flags (tenant_id, type, entity_type, entity_id, user_id, severity, description)
    values (
      p_tenant_id, 'duplicate_photo', 'task', p_task_id, p_user_id, 'high',
      'Duplicate evidence detected (same file hash reused)'
    );
  end if;
end;
$$;

-- ============================================================================
-- FUNCTION: random_verification_sample
-- ============================================================================
-- Selects a random sample of evidence for verification.
-- Default: 10% of evidence submitted in the last 24 hours.
-- ============================================================================

create or replace function public.random_verification_sample(
  p_tenant_id uuid,
  p_sample_rate float default 0.1
)
returns table(evidence_id uuid, task_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select e.id, e.task_id
  from public.evidence e
  where e.tenant_id = p_tenant_id
    and e.is_verified = false
    and e.created_at > now() - interval '24 hours'
    and random() < p_sample_rate
  order by e.created_at desc
  limit 100;
end;
$$;

-- ============================================================================
-- TRIGGER: Run anomaly detection on task submission
-- ============================================================================

create or replace function public.on_task_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'submitted' and (old.status is null or old.status != 'submitted') then
    perform public.detect_anomalies(new.tenant_id, new.id, coalesce(new.assigned_to, (select auth.uid())));
  end if;
  return new;
end;
$$;

create trigger trg_on_task_submitted
  after update on public.tasks
  for each row
  execute function public.on_task_submitted();
