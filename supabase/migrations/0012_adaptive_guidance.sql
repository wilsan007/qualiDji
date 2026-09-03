-- ============================================================================
-- Migration 0012: Adaptive guidance — competency profile, UI modes, micro-learning
-- ============================================================================
-- Sprint 15: Accompagnement adaptatif
-- Tables: user_profiles_v2, learning_capsules, capsule_completions,
--         ui_mode_history, contextual_help
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'ui_mode') then
    create type ui_mode as enum ('guided', 'assisted', 'expert');
  end if;
end $$;
create type proficiency_level as enum ('novice', 'intermediate', 'confirmed', 'expert');
create type capsule_type as enum ('video', 'audio', 'interactive', 'text', 'quiz');
create type capsule_lang as enum ('fr', 'en', 'ar', 'so');

-- ============================================================================
-- TABLES
-- ============================================================================

-- Extend user competency profile (complements profiles table)
create table public.user_proficiency (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  level proficiency_level not null default 'novice',
  ui_mode ui_mode not null default 'guided',
  -- Signals for automatic promotion
  tasks_completed integer not null default 0,
  tasks_without_anomaly integer not null default 0,
  capsules_completed integer not null default 0,
  quiz_average_score numeric not null default 0,
  -- Manual override
  manual_override boolean not null default false,
  manual_level proficiency_level,
  manual_mode ui_mode,
  -- Onboarding questionnaire results
  onboarding_answers jsonb,
  onboarding_completed_at timestamptz,
  -- Auto-evaluation
  last_auto_evaluation_at timestamptz,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, user_id)
);

create table public.learning_capsules (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references public.tenants(id) on delete cascade,  -- null = global capsule
  standard_id uuid references public.standards(id) on delete set null,
  requirement_ids uuid[] not null default '{}'::uuid[],
  title text not null,
  title_en text,
  title_ar text,
  title_so text,
  description text,
  type capsule_type not null default 'video',
  lang capsule_lang not null default 'fr',
  duration_minutes integer not null default 5,
  media_url text,                  -- video/audio URL
  transcript text,                 -- full text transcript
  content jsonb not null default '{}'::jsonb,  -- interactive content, quiz questions, etc.
  quiz jsonb not null default '[]'::jsonb,     -- [{question, options[], correctIndex, explanation}]
  passing_score integer not null default 70,
  is_mandatory boolean not null default false,
  target_level proficiency_level not null default 'novice',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.capsule_completions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  capsule_id uuid not null references public.learning_capsules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  score integer,                   -- quiz score percentage
  passed boolean,
  time_spent_seconds integer,      -- actual time spent
  created_at timestamptz not null default now(),
  unique(capsule_id, user_id)
);

create table public.ui_mode_history (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_mode ui_mode not null,
  new_mode ui_mode not null,
  reason text not null default 'manual',  -- 'manual', 'auto_promotion', 'onboarding'
  changed_at timestamptz not null default now()
);

create table public.contextual_help (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references public.tenants(id) on delete cascade,  -- null = global
  help_key text not null,          -- e.g. 'task.submit', 'evidence.upload', 'nc.create'
  level proficiency_level not null default 'novice',
  lang capsule_lang not null default 'fr',
  title text not null,
  content text not null,
  video_url text,
  audio_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(help_key, level, lang)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_user_proficiency_tenant on public.user_proficiency(tenant_id);
create index idx_user_proficiency_user on public.user_proficiency(user_id);
create index idx_learning_capsules_tenant on public.learning_capsules(tenant_id);
create index idx_learning_capsules_standard on public.learning_capsules(standard_id);
create index idx_learning_capsules_active on public.learning_capsules(is_active);
create index idx_capsule_completions_user on public.capsule_completions(user_id);
create index idx_capsule_completions_capsule on public.capsule_completions(capsule_id);
create index idx_ui_mode_history_user on public.ui_mode_history(user_id);
create index idx_contextual_help_key on public.contextual_help(help_key);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.user_proficiency enable row level security;
alter table public.learning_capsules enable row level security;
alter table public.capsule_completions enable row level security;
alter table public.ui_mode_history enable row level security;
alter table public.contextual_help enable row level security;

-- User proficiency: users see their own, managers see all
create policy user_proficiency_select on public.user_proficiency
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      user_id = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  );

create policy user_proficiency_insert on public.user_proficiency
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

create policy user_proficiency_update on public.user_proficiency
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      user_id = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  )
  with check (tenant_id = public.current_tenant_id());

create policy user_proficiency_delete on public.user_proficiency
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Learning capsules: all tenant users can see active; managers manage
create policy learning_capsules_select on public.learning_capsules
  for select to authenticated
  using (
    is_active = true
    and (
      tenant_id = public.current_tenant_id()
      or tenant_id is null
    )
  );

create policy learning_capsules_insert on public.learning_capsules
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy learning_capsules_update on public.learning_capsules
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

create policy learning_capsules_delete on public.learning_capsules
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Capsule completions: users see their own, managers see all
create policy capsule_completions_select on public.capsule_completions
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      user_id = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  );

create policy capsule_completions_insert on public.capsule_completions
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

create policy capsule_completions_update on public.capsule_completions
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  )
  with check (tenant_id = public.current_tenant_id());

-- UI mode history: users see their own
create policy ui_mode_history_select on public.ui_mode_history
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

create policy ui_mode_history_insert on public.ui_mode_history
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

-- Contextual help: all can see
create policy contextual_help_select on public.contextual_help
  for select to authenticated
  using (
    is_active = true
    and (
      tenant_id = public.current_tenant_id()
      or tenant_id is null
    )
  );

create policy contextual_help_insert on public.contextual_help
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy contextual_help_update on public.contextual_help
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (tenant_id = public.current_tenant_id());

-- ============================================================================
-- TRIGGERS: updated_at
-- ============================================================================

create trigger trg_user_proficiency_updated_at
  before update on public.user_proficiency
  for each row execute function public.set_updated_at();

create trigger trg_learning_capsules_updated_at
  before update on public.learning_capsules
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: Auto-evaluate and promote user proficiency
-- ============================================================================
-- Criteria from the plan:
-- - 5 capsules completed + 50 tasks without anomaly → Intermediate
-- - 15 capsules + 200 tasks without anomaly + quiz avg > 80% → Confirmed
-- - 30 capsules + 500 tasks + quiz avg > 90% → Expert

create or replace function public.evaluate_proficiency(p_user_id uuid)
returns proficiency_level
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof record;
  v_new_level proficiency_level;
  v_old_level proficiency_level;
  v_old_mode ui_mode;
  v_new_mode ui_mode;
  v_tenant_id uuid;
begin
  select * into v_prof
  from public.user_proficiency
  where user_id = p_user_id
  for update;

  if not found then return 'novice'; end if;

  -- Don't auto-evaluate if manually overridden
  if v_prof.manual_override and v_prof.manual_level is not null then
    return v_prof.manual_level;
  end if;

  v_old_level := v_prof.level;
  v_old_mode := v_prof.ui_mode;
  v_tenant_id := v_prof.tenant_id;

  -- Determine level based on signals
  if v_prof.capsules_completed >= 30
     and v_prof.tasks_without_anomaly >= 500
     and v_prof.quiz_average_score >= 90 then
    v_new_level := 'expert';
    v_new_mode := 'expert';
  elsif v_prof.capsules_completed >= 15
     and v_prof.tasks_without_anomaly >= 200
     and v_prof.quiz_average_score >= 80 then
    v_new_level := 'confirmed';
    v_new_mode := 'expert';
  elsif v_prof.capsules_completed >= 5
     and v_prof.tasks_without_anomaly >= 50 then
    v_new_level := 'intermediate';
    v_new_mode := 'assisted';
  else
    v_new_level := 'novice';
    v_new_mode := 'guided';
  end if;

  -- Update if changed
  if v_new_level != v_old_level then
    update public.user_proficiency
    set level = v_new_level,
        ui_mode = v_new_mode,
        last_auto_evaluation_at = now(),
        promoted_at = now()
    where user_id = p_user_id;

    -- Log the mode change
    insert into public.ui_mode_history (tenant_id, user_id, previous_mode, new_mode, reason)
    values (v_tenant_id, p_user_id, v_old_mode, v_new_mode, 'auto_promotion');

    -- Notify the user
    perform public.create_notification(
      v_tenant_id,
      p_user_id,
      'system',
      'Votre niveau a été mis à jour',
      'Félicitations ! Vous êtes passé au niveau: ' || v_new_level::text,
      '/tenant/profile',
      'Voir mon profil',
      'normal'
    );
  end if;

  return v_new_level;
end;
$$;

-- ============================================================================
-- TRIGGER: Update proficiency signals on capsule completion
-- ============================================================================

create or replace function public.on_capsule_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.completed_at is not null and (old.completed_at is null or old.completed_at != new.completed_at) then
    -- Update proficiency counters
    update public.user_proficiency
    set capsules_completed = capsules_completed + 1,
        quiz_average_score = case
          when new.score is not null then
            (quiz_average_score * capsules_completed + new.score) / (capsules_completed + 1)
          else quiz_average_score
        end
    where user_id = new.user_id;

    -- Trigger auto-evaluation
    perform public.evaluate_proficiency(new.user_id);
  end if;

  return new;
end;
$$;

create trigger trg_on_capsule_completed
  after update on public.capsule_completions
  for each row
  execute function public.on_capsule_completed();

-- ============================================================================
-- TRIGGER: Update proficiency signals on task completion
-- ============================================================================

create or replace function public.on_task_completed_proficiency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_anomaly boolean;
  v_assignee uuid;
begin
  -- Only when task moves to verified status
  if new.status = 'verified' and (old.status != 'verified' or old.status is null) then
    -- Check if any anomalies were flagged on this task's evidence
    select exists(
      select 1 from public.anomaly_flags af
      join public.evidence e on e.id = af.evidence_id
      join public.task_completions tc on tc.id = e.task_completion_id
      where tc.task_id = new.id
    ) into v_has_anomaly;

    v_assignee := new.assignee_id;

    if v_assignee is not null then
      update public.user_proficiency
      set tasks_completed = tasks_completed + 1,
          tasks_without_anomaly = tasks_without_anomaly + case when not v_has_anomaly then 1 else 0 end
      where user_id = v_assignee;

      perform public.evaluate_proficiency(v_assignee);
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_on_task_completed_proficiency
  after update on public.tasks
  for each row
  execute function public.on_task_completed_proficiency();

-- ============================================================================
-- FUNCTION: Get user's effective UI mode
-- ============================================================================

create or replace function public.get_user_ui_mode(p_user_id uuid)
returns ui_mode
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode ui_mode;
begin
  select
    case
      when manual_override and manual_mode is not null then manual_mode
      else ui_mode
    end
  into v_mode
  from public.user_proficiency
  where user_id = p_user_id;

  return coalesce(v_mode, 'guided');
end;
$$;

-- ============================================================================
-- FUNCTION: Get user's effective proficiency level
-- ============================================================================

create or replace function public.get_user_level(p_user_id uuid)
returns proficiency_level
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level proficiency_level;
begin
  select
    case
      when manual_override and manual_level is not null then manual_level
      else level
    end
  into v_level
  from public.user_proficiency
  where user_id = p_user_id;

  return coalesce(v_level, 'novice');
end;
$$;
