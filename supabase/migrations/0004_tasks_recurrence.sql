-- ============================================================================
-- Migration 0004: Tasks, task templates, and RRULE recurrence
-- ============================================================================
-- Domain C: Génération de tâches et planification
-- Tables: task_templates, tasks, task_instances, task_recurrences,
--         task_completions, task_verifications
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type task_status as enum ('pending', 'in_progress', 'submitted', 'verified', 'rejected', 'overdue');
create type task_priority as enum ('low', 'medium', 'high', 'critical');
create type verification_status as enum ('pending', 'approved', 'rejected', 'expired');

-- ============================================================================
-- TABLES — Task templates (generated from requirements)
-- ============================================================================

create table public.task_templates (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requirement_id uuid not null references public.requirements(id),
  standard_id uuid not null references public.standards(id),
  title text not null,
  title_en text,
  title_ar text,
  title_so text,
  description text,
  description_en text,
  description_ar text,
  description_so text,
  instructions text,
  instructions_en text,
  instructions_ar text,
  instructions_so text,
  evidence_level_min evidence_level not null default '1',
  default_role user_role not null default 'operator',
  period interval not null default '1 month',
  rrule text,                    -- RFC 5545 RRULE string, e.g. 'FREQ=MONTHLY;BYMONTHDAY=1'
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- TABLES — Task instances (generated from templates)
-- ============================================================================

create table public.tasks (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_id uuid references public.task_templates(id) on delete set null,
  requirement_id uuid references public.requirements(id),
  standard_id uuid not null references public.standards(id),
  site_id uuid references public.sites(id) on delete cascade,
  title text not null,
  description text,
  instructions text,
  assigned_to uuid references auth.users(id),
  assigned_role user_role default 'operator',
  status task_status not null default 'pending',
  priority task_priority not null default 'medium',
  evidence_level_min evidence_level not null default '1',
  due_date timestamptz not null,
  started_at timestamptz,
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  rejection_reason text,
  rrule text,
  parent_task_id uuid references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Task completions (evidence submission by executor)
create table public.task_completions (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  comment text,
  location point,
  device_info jsonb,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Task verifications (by quality_manager or process_owner)
create table public.task_verifications (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  verifier_id uuid not null references auth.users(id),
  status verification_status not null default 'pending',
  comment text,
  verified_at timestamptz not null default now(),
  expires_at timestamptz,         -- verification valid until this date
  created_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_task_templates_tenant on public.task_templates(tenant_id);
create index idx_task_templates_requirement on public.task_templates(requirement_id);
create index idx_tasks_tenant on public.tasks(tenant_id);
create index idx_tasks_assigned_to on public.tasks(assigned_to);
create index idx_tasks_status on public.tasks(status);
create index idx_tasks_due_date on public.tasks(due_date);
create index idx_tasks_requirement on public.tasks(requirement_id);
create index idx_tasks_site on public.tasks(site_id);
create index idx_task_completions_task on public.task_completions(task_id);
create index idx_task_verifications_task on public.task_verifications(task_id);
create index idx_task_verifications_verifier on public.task_verifications(verifier_id);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.task_templates enable row level security;
alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;
alter table public.task_verifications enable row level security;

-- Task templates: admin and quality_manager can manage
create policy task_templates_select on public.task_templates
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy task_templates_insert on public.task_templates
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy task_templates_update on public.task_templates
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy task_templates_delete on public.task_templates
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Tasks: users see tasks assigned to them or all if manager
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      assigned_to = (select auth.uid())
      or public.has_role(array['super_admin', 'tenant_admin', 'director', 'quality_manager', 'process_owner'])
    )
  );

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin', 'process_owner'])
  );

create policy tasks_update on public.tasks
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      assigned_to = (select auth.uid())
      or public.has_role(array['super_admin', 'tenant_admin', 'quality_manager', 'process_owner'])
    )
  )
  with check (tenant_id = public.current_tenant_id());

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

-- Task completions: executor submits, managers view
create policy task_completions_select on public.task_completions
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      user_id = (select auth.uid())
      or public.has_role(array['super_admin', 'tenant_admin', 'quality_manager', 'process_owner'])
    )
  );

create policy task_completions_insert on public.task_completions
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

-- Task verifications: only verifiers (quality_manager, process_owner) can manage
create policy task_verifications_select on public.task_verifications
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      verifier_id = (select auth.uid())
      or public.has_role(array['super_admin', 'tenant_admin', 'quality_manager', 'process_owner', 'director'])
    )
  );

create policy task_verifications_insert on public.task_verifications
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['quality_manager', 'process_owner', 'super_admin', 'tenant_admin'])
    -- Role separation: verifier cannot verify their own task
    and not exists (
      select 1 from public.tasks t
      where t.id = task_id and t.assigned_to = (select auth.uid())
    )
  );

-- ============================================================================
-- FUNCTION: generate_tasks_from_templates
-- ============================================================================
-- Generates task instances from active templates based on RRULE recurrence.
-- Called by a scheduled job (Supabase Edge Function or pg_cron).
-- ============================================================================

create or replace function public.generate_tasks_from_templates(
  p_tenant_id uuid,
  p_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_template record;
  v_due_date timestamptz;
  v_existing_count integer;
begin
  for v_template in
    select * from public.task_templates
    where tenant_id = p_tenant_id
      and is_active = true
  loop
    -- Calculate next due date from RRULE or period
    if v_template.rrule is not null then
      -- Simple RRULE parsing: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY
      v_due_date := case
        when v_template.rrule like '%FREQ=DAILY%' then
          (p_date + interval '1 day')::timestamptz
        when v_template.rrule like '%FREQ=WEEKLY%' then
          (p_date + interval '7 days')::timestamptz
        when v_template.rrule like '%FREQ=MONTHLY%' then
          (p_date + interval '1 month')::timestamptz
        when v_template.rrule like '%FREQ=YEARLY%' then
          (p_date + interval '1 year')::timestamptz
        else
          (p_date + v_template.period)::timestamptz
      end;
    else
      v_due_date := (p_date + v_template.period)::timestamptz;
    end if;

    -- Check if a task already exists for this period
    select count(*) into v_existing_count
    from public.tasks
    where template_id = v_template.id
      and tenant_id = p_tenant_id
      and due_date >= p_date::timestamptz
      and due_date < (p_date + interval '1 day')::timestamptz;

    if v_existing_count = 0 then
      insert into public.tasks (
        tenant_id, template_id, requirement_id, standard_id,
        title, description, instructions,
        assigned_role, evidence_level_min,
        due_date, rrule, status
      )
      values (
        p_tenant_id,
        v_template.id,
        v_template.requirement_id,
        v_template.standard_id,
        v_template.title,
        v_template.description,
        v_template.instructions,
        v_template.default_role,
        v_template.evidence_level_min,
        v_due_date,
        v_template.rrule,
        'pending'
      );
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- ============================================================================
-- FUNCTION: mark_overdue_tasks
-- ============================================================================
-- Marks tasks past their due_date and not yet submitted as overdue.
-- ============================================================================

create or replace function public.mark_overdue_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.tasks
  set status = 'overdue', updated_at = now()
  where status in ('pending', 'in_progress')
    and due_date < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- TRIGGER: Prevent self-verification (role separation)
-- ============================================================================

create or replace function public.prevent_self_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned_to uuid;
begin
  select assigned_to into v_assigned_to
  from public.tasks
  where id = new.task_id;

  if v_assigned_to = new.verifier_id then
    raise exception 'Role separation violation: cannot verify your own task';
  end if;

  return new;
end;
$$;

create trigger trg_prevent_self_verification
  before insert on public.task_verifications
  for each row
  execute function public.prevent_self_verification();

-- ============================================================================
-- UPDATED_AT triggers
-- ============================================================================

create trigger trg_task_templates_updated_at
  before update on public.task_templates
  for each row execute function public.set_updated_at();

create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();
