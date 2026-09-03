-- ============================================================================
-- Migration 0011: Competencies, trainings, suppliers, equipment, management review
-- ============================================================================
-- Sprint 14: ISO 9001 chapters 7-9
-- Tables: competencies, job_positions, user_competencies, trainings,
--         training_sessions, training_attendance,
--         suppliers, supplier_evaluations, supplier_documents, supplier_portal_tokens,
--         equipment, calibrations, maintenance_plans,
--         management_reviews, review_inputs, review_decisions
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type competency_level as enum ('0', '1', '2', '3', '4');  -- 0=none, 1=beginner, 2=intermediate, 3=advanced, 4=expert
create type training_status as enum ('planned', 'scheduled', 'in_progress', 'completed', 'cancelled');
create type attendance_status as enum ('registered', 'attended', 'absent', 'excused');
create type supplier_status as enum ('approved', 'conditional', 'disqualified', 'prospective');
create type evaluation_result as enum ('excellent', 'good', 'satisfactory', 'needs_improvement', 'unacceptable');
create type equipment_status as enum ('active', 'out_of_service', 'calibration_due', 'retired');
create type review_status as enum ('planned', 'in_progress', 'completed', 'cancelled');

-- ============================================================================
-- COMPETENCIES & TRAINING
-- ============================================================================

create table public.competencies (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  required_level competency_level not null default '2',
  category text,                   -- 'technical', 'quality', 'safety', 'soft_skill'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, code)
);

create table public.job_positions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  code text not null,
  description text,
  competency_requirements jsonb not null default '[]'::jsonb,  -- [{competency_id, required_level}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, code)
);

create table public.user_competencies (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  competency_id uuid not null references public.competencies(id) on delete cascade,
  current_level competency_level not null default '0',
  target_level competency_level,
  gap integer not null default 0,
  assessed_by uuid references auth.users(id) on delete set null,
  assessed_at date,
  evidence_id uuid references public.evidence(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, competency_id)
);

create table public.trainings (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  code text not null,
  description text,
  competency_id uuid references public.competencies(id) on delete set null,
  duration_hours numeric,
  provider text,                   -- internal or external provider
  method text,                     -- 'classroom', 'elearning', 'on_the_job', 'external'
  is_mandatory boolean not null default false,
  renewal_period interval,         -- e.g. '1 year' for recurring training
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, code)
);

create table public.training_sessions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  training_id uuid not null references public.trainings(id) on delete cascade,
  trainer text not null,           -- trainer name or user_id
  trainer_user_id uuid references auth.users(id) on delete set null,
  scheduled_date date not null,
  end_date date,
  location text,
  max_participants integer,
  status training_status not null default 'planned',
  certificate_template text,       -- template for attendance certificate
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_attendance (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  status attendance_status not null default 'registered',
  score numeric,                   -- exam score if applicable
  passed boolean,
  certificate_path text,           -- Supabase Storage path to certificate
  attended_at timestamptz,
  created_at timestamptz not null default now(),
  unique(session_id, user_id)
);

-- ============================================================================
-- SUPPLIERS
-- ============================================================================

create table public.suppliers (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  contact_person text,
  email text,
  phone text,
  address text,
  country text not null default 'Djibouti',
  category text,                   -- 'goods', 'services', 'subcontractor'
  criticality text not null default 'medium',  -- 'low', 'medium', 'high', 'critical'
  status supplier_status not null default 'prospective',
  approval_date date,
  disqualification_date date,
  disqualification_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, code)
);

create table public.supplier_evaluations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  evaluation_date date not null default current_date,
  evaluated_by uuid not null references auth.users(id),
  criteria jsonb not null default '[]'::jsonb,  -- [{criterion, score (1-5), comment}]
  total_score numeric,
  result evaluation_result,
  comments text,
  next_evaluation_date date,
  created_at timestamptz not null default now()
);

create table public.supplier_documents (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  document_type text not null,     -- 'iso_certificate', 'insurance', 'material_certificate', etc.
  file_name text not null,
  storage_path text not null,
  file_hash text,
  issued_at date,
  expires_at date,                 -- for certificates with expiry
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.supplier_portal_tokens (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  token text not null unique,
  contact_email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- EQUIPMENT & CALIBRATION
-- ============================================================================

create table public.equipment (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  serial_number text,
  model text,
  manufacturer text,
  location text,
  site_id uuid references public.sites(id) on delete set null,
  process_id uuid references public.processes(id) on delete set null,
  category text,                   -- 'measurement', 'production', 'it', 'vehicle'
  status equipment_status not null default 'active',
  purchase_date date,
  purchase_value numeric,
  qr_code text,                    -- QR code identifier for scanning
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, code)
);

create table public.calibrations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  calibration_date date not null,
  next_calibration_date date not null,
  performed_by text not null,      -- internal or external lab
  lab_certificate text,            -- certificate reference
  result text not null,            -- 'pass', 'fail', 'adjustment'
  deviation numeric,
  unit text,
  storage_path text,               -- certificate file
  notes text,
  created_at timestamptz not null default now()
);

create table public.maintenance_plans (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  type text not null,              -- 'preventive', 'predictive', 'corrective'
  frequency text not null,         -- 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'
  description text not null,
  last_performed_date date,
  next_due_date date not null,
  responsible_id uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- MANAGEMENT REVIEW (ISO 9001 §9.3)
-- ============================================================================

create table public.management_reviews (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  review_date date not null,
  location text,
  chairperson_id uuid not null references auth.users(id),
  participant_ids uuid[] not null default '{}'::uuid[],
  status review_status not null default 'planned',
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.review_inputs (
  id uuid primary key default uuid_generate_v4(),
  review_id uuid not null references public.management_reviews(id) on delete cascade,
  input_type text not null,        -- corresponds to ISO 9001 §9.3.2 items
  title text not null,
  summary text,
  data jsonb,                      -- compiled data (charts, stats, etc.)
  source_table text,               -- where the data was compiled from
  source_ids uuid[],
  compiled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.review_decisions (
  id uuid primary key default uuid_generate_v4(),
  review_id uuid not null references public.management_reviews(id) on delete cascade,
  decision_type text not null,     -- 'action', 'improvement', 'resource', 'change'
  description text not null,
  assigned_to uuid references auth.users(id) on delete set null,
  due_date date,
  capa_id uuid references public.capa_actions(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_competencies_tenant on public.competencies(tenant_id);
create index idx_job_positions_tenant on public.job_positions(tenant_id);
create index idx_user_competencies_user on public.user_competencies(user_id);
create index idx_user_competencies_tenant on public.user_competencies(tenant_id);
create index idx_trainings_tenant on public.trainings(tenant_id);
create index idx_training_sessions_tenant on public.training_sessions(tenant_id);
create index idx_training_sessions_training on public.training_sessions(training_id);
create index idx_training_attendance_session on public.training_attendance(session_id);
create index idx_training_attendance_user on public.training_attendance(user_id);
create index idx_suppliers_tenant on public.suppliers(tenant_id);
create index idx_suppliers_status on public.suppliers(status);
create index idx_supplier_evaluations_supplier on public.supplier_evaluations(supplier_id);
create index idx_supplier_documents_supplier on public.supplier_documents(supplier_id);
create index idx_supplier_documents_expiry on public.supplier_documents(expires_at);
create index idx_supplier_portal_tokens_token on public.supplier_portal_tokens(token);
create index idx_equipment_tenant on public.equipment(tenant_id);
create index idx_equipment_status on public.equipment(status);
create index idx_calibrations_equipment on public.calibrations(equipment_id);
create index idx_calibrations_next on public.calibrations(next_calibration_date);
create index idx_maintenance_plans_equipment on public.maintenance_plans(equipment_id);
create index idx_maintenance_plans_next on public.maintenance_plans(next_due_date);
create index idx_management_reviews_tenant on public.management_reviews(tenant_id);
create index idx_review_inputs_review on public.review_inputs(review_id);
create index idx_review_decisions_review on public.review_decisions(review_id);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.competencies enable row level security;
alter table public.job_positions enable row level security;
alter table public.user_competencies enable row level security;
alter table public.trainings enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_attendance enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_evaluations enable row level security;
alter table public.supplier_documents enable row level security;
alter table public.supplier_portal_tokens enable row level security;
alter table public.equipment enable row level security;
alter table public.calibrations enable row level security;
alter table public.maintenance_plans enable row level security;
alter table public.management_reviews enable row level security;
alter table public.review_inputs enable row level security;
alter table public.review_decisions enable row level security;

-- Competencies: all can see; quality roles manage
create policy competencies_select on public.competencies
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy competencies_insert on public.competencies
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy competencies_update on public.competencies
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy competencies_delete on public.competencies
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Job positions: same as competencies
create policy job_positions_select on public.job_positions
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy job_positions_insert on public.job_positions
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy job_positions_update on public.job_positions
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy job_positions_delete on public.job_positions
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- User competencies: users see their own, managers see all
create policy user_competencies_select on public.user_competencies
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      user_id = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
    )
  );

create policy user_competencies_insert on public.user_competencies
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy user_competencies_update on public.user_competencies
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy user_competencies_delete on public.user_competencies
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Trainings: all can see; quality roles manage
create policy trainings_select on public.trainings
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy trainings_insert on public.trainings
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy trainings_update on public.trainings
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy trainings_delete on public.trainings
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Training sessions: all can see; quality roles manage
create policy training_sessions_select on public.training_sessions
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy training_sessions_insert on public.training_sessions
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy training_sessions_update on public.training_sessions
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy training_sessions_delete on public.training_sessions
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Training attendance: users see their own, managers see all
create policy training_attendance_select on public.training_attendance
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      user_id = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
    )
  );

create policy training_attendance_insert on public.training_attendance
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy training_attendance_update on public.training_attendance
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy training_attendance_delete on public.training_attendance
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Suppliers: all can see; quality roles manage
create policy suppliers_select on public.suppliers
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy suppliers_insert on public.suppliers
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy suppliers_update on public.suppliers
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy suppliers_delete on public.suppliers
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Supplier evaluations: all can see; quality roles manage
create policy supplier_evaluations_select on public.supplier_evaluations
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy supplier_evaluations_insert on public.supplier_evaluations
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy supplier_evaluations_delete on public.supplier_evaluations
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Supplier documents: all can see; quality roles manage
create policy supplier_documents_select on public.supplier_documents
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy supplier_documents_insert on public.supplier_documents
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy supplier_documents_delete on public.supplier_documents
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Supplier portal tokens: quality roles only
create policy supplier_portal_tokens_select on public.supplier_portal_tokens
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy supplier_portal_tokens_insert on public.supplier_portal_tokens
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy supplier_portal_tokens_delete on public.supplier_portal_tokens
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Equipment: all can see; quality roles manage
create policy equipment_select on public.equipment
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy equipment_insert on public.equipment
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy equipment_update on public.equipment
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy equipment_delete on public.equipment
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Calibrations: all can see; quality roles manage
create policy calibrations_select on public.calibrations
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy calibrations_insert on public.calibrations
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy calibrations_delete on public.calibrations
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Maintenance plans: all can see; quality roles manage
create policy maintenance_plans_select on public.maintenance_plans
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy maintenance_plans_insert on public.maintenance_plans
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy maintenance_plans_update on public.maintenance_plans
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy maintenance_plans_delete on public.maintenance_plans
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Management reviews: all can see; directors and quality manage
create policy management_reviews_select on public.management_reviews
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy management_reviews_insert on public.management_reviews
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'director', 'super_admin'])
  );

create policy management_reviews_update on public.management_reviews
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'director', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy management_reviews_delete on public.management_reviews
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Review inputs: via review access
create policy review_inputs_select on public.review_inputs
  for select to authenticated
  using (
    exists (
      select 1 from public.management_reviews r
      where r.id = review_inputs.review_id
        and r.tenant_id = public.current_tenant_id()
    )
  );

create policy review_inputs_insert on public.review_inputs
  for insert to authenticated
  with check (
    exists (
      select 1 from public.management_reviews r
      where r.id = review_inputs.review_id
        and r.tenant_id = public.current_tenant_id()
        and public.has_role(array['tenant_admin', 'quality_manager', 'director', 'super_admin'])
    )
  );

create policy review_inputs_update on public.review_inputs
  for update to authenticated
  using (
    exists (
      select 1 from public.management_reviews r
      where r.id = review_inputs.review_id
        and r.tenant_id = public.current_tenant_id()
    )
  );

create policy review_inputs_delete on public.review_inputs
  for delete to authenticated
  using (
    exists (
      select 1 from public.management_reviews r
      where r.id = review_inputs.review_id
        and r.tenant_id = public.current_tenant_id()
        and public.has_role(array['tenant_admin', 'super_admin'])
    )
  );

-- Review decisions: via review access
create policy review_decisions_select on public.review_decisions
  for select to authenticated
  using (
    exists (
      select 1 from public.management_reviews r
      where r.id = review_decisions.review_id
        and r.tenant_id = public.current_tenant_id()
    )
  );

create policy review_decisions_insert on public.review_decisions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.management_reviews r
      where r.id = review_decisions.review_id
        and r.tenant_id = public.current_tenant_id()
        and public.has_role(array['tenant_admin', 'quality_manager', 'director', 'super_admin'])
    )
  );

create policy review_decisions_update on public.review_decisions
  for update to authenticated
  using (
    exists (
      select 1 from public.management_reviews r
      where r.id = review_decisions.review_id
        and r.tenant_id = public.current_tenant_id()
    )
  );

create policy review_decisions_delete on public.review_decisions
  for delete to authenticated
  using (
    exists (
      select 1 from public.management_reviews r
      where r.id = review_decisions.review_id
        and r.tenant_id = public.current_tenant_id()
        and public.has_role(array['tenant_admin', 'super_admin'])
    )
  );

-- ============================================================================
-- TRIGGERS: updated_at
-- ============================================================================

-- Function to compute competency gap
create or replace function public.compute_competency_gap()
returns trigger
language plpgsql
as $$
begin
  if new.target_level is not null then
    new.gap := cast(new.target_level::text as integer) - cast(new.current_level::text as integer);
  else
    new.gap := 0;
  end if;
  return new;
end;
$$;

create trigger trg_compute_competency_gap
  before insert or update on public.user_competencies
  for each row execute function public.compute_competency_gap();

create trigger trg_competencies_updated_at
  before update on public.competencies
  for each row execute function public.set_updated_at();

create trigger trg_job_positions_updated_at
  before update on public.job_positions
  for each row execute function public.set_updated_at();

create trigger trg_user_competencies_updated_at
  before update on public.user_competencies
  for each row execute function public.set_updated_at();

create trigger trg_trainings_updated_at
  before update on public.trainings
  for each row execute function public.set_updated_at();

create trigger trg_training_sessions_updated_at
  before update on public.training_sessions
  for each row execute function public.set_updated_at();

create trigger trg_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

create trigger trg_equipment_updated_at
  before update on public.equipment
  for each row execute function public.set_updated_at();

create trigger trg_maintenance_plans_updated_at
  before update on public.maintenance_plans
  for each row execute function public.set_updated_at();

create trigger trg_management_reviews_updated_at
  before update on public.management_reviews
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: Compile management review inputs (ISO 9001 §9.3.2)
-- ============================================================================

create or replace function public.compile_review_inputs(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_review_date date;
  v_open_ncs integer;
  v_closed_ncs integer;
  v_critical_ncs integer;
  v_open_capas integer;
  v_overdue_capas integer;
  v_audits_completed integer;
  v_audits_planned integer;
  v_audit_findings integer;
  v_active_risks integer;
  v_high_risks integer;
  v_active_objectives integer;
  v_achieved_objectives integer;
  v_overdue_tasks integer;
  v_pending_verifications integer;
  v_anomaly_count integer;
begin
  select tenant_id, review_date into v_tenant_id, v_review_date
  from public.management_reviews
  where id = p_review_id;

  if v_tenant_id is null then return; end if;

  -- 9.3.2.a: Status of actions from previous management reviews
  -- (handled by linking review_decisions to previous reviews)

  -- 9.3.2.b: Changes in external/internal issues, standards
  insert into public.review_inputs (review_id, input_type, title, summary, data, compiled_at)
  values (
    p_review_id,
    'context_changes',
    'Changements dans le contexte',
    'Évolution des enjeux internes et externes depuis la dernière revue',
    jsonb_build_object('note', 'À compléter manuellement'),
    now()
  );

  -- 9.3.2.c: Information on quality performance and trends
  select count(*) into v_overdue_tasks
  from public.tasks
  where tenant_id = v_tenant_id and status = 'overdue';

  select count(*) into v_pending_verifications
  from public.task_verifications tv
  join public.tasks t on t.id = tv.task_id
  where t.tenant_id = v_tenant_id and tv.status = 'pending';

  select count(*) into v_anomaly_count
  from public.anomaly_flags
  where tenant_id = v_tenant_id and is_resolved = false;

  insert into public.review_inputs (review_id, input_type, title, summary, data, compiled_at)
  values (
    p_review_id,
    'performance',
    'Performance et tendances qualité',
    'Indicateurs de performance du SMQ',
    jsonb_build_object(
      'overdue_tasks', v_overdue_tasks,
      'pending_verifications', v_pending_verifications,
      'unresolved_anomalies', v_anomaly_count
    ),
    now()
  );

  -- 9.3.2.d: Customer satisfaction and feedback
  insert into public.review_inputs (review_id, input_type, title, summary, data, compiled_at)
  values (
    p_review_id,
    'customer_satisfaction',
    'Satisfaction client',
    'Évaluation de la satisfaction client et réclamations',
    jsonb_build_object('note', 'À compléter avec enquêtes de satisfaction'),
    now()
  );

  -- 9.3.2.e: Effectiveness of actions taken
  select count(*) into v_open_capas
  from public.capa_actions
  where tenant_id = v_tenant_id and status not in ('verified', 'cancelled');

  select count(*) into v_overdue_capas
  from public.capa_actions
  where tenant_id = v_tenant_id
    and due_date < current_date
    and status not in ('verified', 'cancelled');

  insert into public.review_inputs (review_id, input_type, title, summary, data, compiled_at)
  values (
    p_review_id,
    'capa_effectiveness',
    'Efficacité des actions correctives',
    'Suivi des actions CAPA et leur efficacité',
    jsonb_build_object('open_capas', v_open_capas, 'overdue_capas', v_overdue_capas),
    now()
  );

  -- 9.3.2.f: Audit results
  select count(*) into v_audits_completed
  from public.audit_cycles
  where tenant_id = v_tenant_id and status = 'completed';

  select count(*) into v_audits_planned
  from public.audit_cycles
  where tenant_id = v_tenant_id and status in ('planned', 'scheduled');

  select count(*) into v_audit_findings
  from public.audit_findings
  where tenant_id = v_tenant_id and status = 'open';

  insert into public.review_inputs (review_id, input_type, title, summary, data, compiled_at)
  values (
    p_review_id,
    'audit_results',
    'Résultats d''audit',
    'Synthèse des audits internes',
    jsonb_build_object(
      'audits_completed', v_audits_completed,
      'audits_planned', v_audits_planned,
      'open_findings', v_audit_findings
    ),
    now()
  );

  -- 9.3.2.g: Nonconformities
  select count(*) into v_open_ncs
  from public.nonconformities
  where tenant_id = v_tenant_id and status not in ('closed', 'cancelled');

  select count(*) into v_closed_ncs
  from public.nonconformities
  where tenant_id = v_tenant_id and status = 'closed';

  select count(*) into v_critical_ncs
  from public.nonconformities
  where tenant_id = v_tenant_id and severity = 'critical' and status != 'closed';

  insert into public.review_inputs (review_id, input_type, title, summary, data, compiled_at)
  values (
    p_review_id,
    'nonconformities',
    'Non-conformités',
    'Synthèse des non-conformités',
    jsonb_build_object(
      'open_ncs', v_open_ncs,
      'closed_ncs', v_closed_ncs,
      'critical_ncs', v_critical_ncs
    ),
    now()
  );

  -- 9.3.2.h: Risk and opportunity management
  select count(*) into v_active_risks
  from public.risks
  where tenant_id = v_tenant_id and status != 'closed';

  select count(*) into v_high_risks
  from public.risks
  where tenant_id = v_tenant_id and score >= 60 and status != 'closed';

  insert into public.review_inputs (review_id, input_type, title, summary, data, compiled_at)
  values (
    p_review_id,
    'risks_opportunities',
    'Risques et opportunités',
    'État du registre des risques et opportunités',
    jsonb_build_object('active_risks', v_active_risks, 'high_risks', v_high_risks),
    now()
  );

  -- 9.3.2.i: Objectives achievement
  select count(*) into v_active_objectives
  from public.objectives
  where tenant_id = v_tenant_id and status = 'active';

  select count(*) into v_achieved_objectives
  from public.objectives
  where tenant_id = v_tenant_id and status = 'achieved';

  insert into public.review_inputs (review_id, input_type, title, summary, data, compiled_at)
  values (
    p_review_id,
    'objectives',
    'Atteinte des objectifs qualité',
    'Suivi des objectifs qualité',
    jsonb_build_object(
      'active_objectives', v_active_objectives,
      'achieved_objectives', v_achieved_objectives
    ),
    now()
  );
end;
$$;

-- ============================================================================
-- TRIGGER: Notify on supplier certificate expiring
-- ============================================================================

create or replace function public.check_supplier_certificate_expiry()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select sd.id, sd.supplier_id, sd.tenant_id, sd.document_type, sd.expires_at,
           s.name as supplier_name
    from public.supplier_documents sd
    join public.suppliers s on s.id = sd.supplier_id
    where sd.expires_at <= current_date + interval '30 days'
      and sd.expires_at >= current_date
  loop
    -- Notify quality managers
    perform public.create_notification(
      r.tenant_id,
      null,  -- will be handled by preference system
      'certificate_expiring',
      'Certificat fournisseur expirant: ' || r.supplier_name,
      'Le certificat "' || r.document_type || '" du fournisseur ' || r.supplier_name ||
      ' expire le ' || r.expires_at::text,
      '/tenant/suppliers/' || r.supplier_id,
      'Voir le fournisseur',
      'high'
    );
  end loop;
end;
$$;

-- ============================================================================
-- TRIGGER: Notify on calibration due
-- ============================================================================

create or replace function public.check_calibration_due()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select c.id, c.equipment_id, c.tenant_id, c.next_calibration_date,
           e.name as equipment_name, e.code as equipment_code
    from public.calibrations c
    join public.equipment e on e.id = c.equipment_id
    where c.next_calibration_date <= current_date + interval '30 days'
      and c.next_calibration_date >= current_date
  loop
    perform public.create_notification(
      r.tenant_id,
      null,
      'calibration_due',
      'Étalonnage à prévoir: ' || r.equipment_name,
      'L''équipement ' || r.equipment_code || ' - ' || r.equipment_name ||
      ' doit être étalonné avant le ' || r.next_calibration_date::text,
      '/tenant/equipment/' || r.equipment_id,
      'Voir l''équipement',
      'normal'
    );
  end loop;
end;
$$;
