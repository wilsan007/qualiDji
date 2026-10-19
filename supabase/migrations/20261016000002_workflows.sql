-- ============================================================================
-- Migration 0001 (2/4): Workflows métier §3 — définis par le RQ, versionnés
-- Types de steps : Annexe B spec
-- ============================================================================

create table public.workflow_definitions (
  id text primary key,
  name text not null,
  standard_clause text not null,
  version int not null default 1,
  owner_role text not null default 'quality_manager',
  frequency text not null default 'event_based'
    check (frequency in ('annual', 'event_based', 'continuous')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, version)
);

create table public.workflow_actions (
  id text primary key,
  workflow_id text not null references public.workflow_definitions (id),
  title text not null,
  objective text not null,
  assigned_role text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.workflow_steps (
  id text primary key,
  action_id text not null references public.workflow_actions (id) on delete cascade,
  sequence int not null,
  title text not null,
  instruction text not null,
  step_type text not null check (step_type in (
    'instruction', 'text_input', 'number_input', 'choice', 'checkbox', 'date',
    'signature', 'photo', 'file_upload', 'barcode', 'qr_scan', 'sensor_value',
    'location_check', 'confirmation', 'knowledge_question', 'approval'
  )),
  required boolean not null default true,
  validation_rule text,
  evidence_requirement text not null default 'auto_save',
  approver_role text,
  segregation_of_duties boolean not null default false,
  ai_guidance_enabled boolean not null default true,
  ai_prompt_template text,
  guardrails jsonb not null default '[]'::jsonb,
  choices jsonb,
  unique (action_id, sequence)
);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workflow_id text not null references public.workflow_definitions (id),
  action_def_id text not null references public.workflow_actions (id),
  assigned_to uuid references auth.users (id),
  status text not null default 'assigned'
    check (status in ('assigned', 'in_progress', 'submitted', 'approved', 'blocked', 'closed')),
  due_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);
create index actions_tenant_idx on public.actions (tenant_id);
create index actions_assigned_idx on public.actions (assigned_to);

create table public.step_submissions (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.actions (id) on delete cascade,
  step_id text not null references public.workflow_steps (id),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  value jsonb,
  submitted_by uuid references auth.users (id),
  submitted_at timestamptz not null default now(),
  unique (action_id, step_id)
);
