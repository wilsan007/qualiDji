-- ============================================================================
-- Migration 0001 (3/4): Moteur IA §5 + preuves §6 + NC/CAPA
-- L'IA ne crée jamais workflows / procédures / seuils / exigences.
-- ============================================================================

create table public.ai_prompt_templates (
  id text primary key,
  clause text not null,
  template text not null,
  created_at timestamptz not null default now()
);

create table public.ai_interventions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  action_id uuid references public.actions (id) on delete set null,
  step_id text references public.workflow_steps (id) on delete set null,
  prompt_template_id text references public.ai_prompt_templates (id),
  prompt_text text not null,
  context jsonb not null default '{}'::jsonb,
  response jsonb not null default '{}'::jsonb,
  micro_steps jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  confidence numeric,
  status text not null default 'draft'
    check (status in ('draft', 'validated', 'rejected')),
  created_at timestamptz not null default now()
);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  action_id uuid references public.actions (id) on delete set null,
  step_submission_id uuid references public.step_submissions (id) on delete set null,
  kind text not null check (kind in ('file', 'photo', 'measure', 'text', 'system')),
  storage_path text,
  checksum text,
  exif jsonb,
  value jsonb,
  captured_by uuid references auth.users (id),
  captured_at timestamptz not null default now(),
  workflow_version int
);
create index evidence_tenant_idx on public.evidence (tenant_id);
create index evidence_action_idx on public.evidence (action_id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_id uuid references auth.users (id),
  action text not null,
  entity text not null,
  entity_id text not null,
  payload jsonb not null default '{}'::jsonb,
  correlation_id uuid,
  created_at timestamptz not null default now()
);
create index audit_log_tenant_idx on public.audit_log (tenant_id);

create table public.integrity_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  action_id uuid references public.actions (id) on delete set null,
  rule text not null,
  value jsonb,
  resolution text,
  created_at timestamptz not null default now()
);

create table public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  actor_id uuid references auth.users (id),
  code text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.sync_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  device_id text not null,
  payload jsonb not null default '{}'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.nonconformities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  action_id uuid references public.actions (id) on delete set null,
  title text not null,
  severity text not null default 'minor'
    check (severity in ('minor', 'major', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'closed')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.capas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nonconformity_id uuid not null references public.nonconformities (id) on delete cascade,
  root_cause text,
  corrective_action text,
  effectiveness_check_at timestamptz,
  effectiveness_result text,
  status text not null default 'open'
    check (status in ('open', 'implemented', 'verified', 'closed', 'reopened')),
  created_at timestamptz not null default now()
);
