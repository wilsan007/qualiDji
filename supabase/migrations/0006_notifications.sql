-- ============================================================================
-- Migration 0006: Notifications, reminders, and expiry tracking
-- ============================================================================
-- Domain E: Notifications, rappels, alertes d'expiration
-- Tables: notifications, notification_preferences, notification_templates,
--         reminders, expiry_tracking
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type notification_channel as enum ('in_app', 'email', 'push', 'sms');
create type notification_priority as enum ('low', 'normal', 'high', 'urgent');
create type notification_category as enum (
  'task_due', 'task_overdue', 'task_assigned', 'task_rejected',
  'evidence_required', 'evidence_verified', 'evidence_rejected',
  'document_expiring', 'document_expired',
  'certificate_expiring', 'certificate_expired',
  'calibration_due', 'calibration_overdue',
  'audit_scheduled', 'audit_overdue',
  'nc_opened', 'nc_overdue', 'nc_closed',
  'anomaly_detected', 'verification_required',
  'training_due', 'review_due',
  'invitation_sent', 'invitation_accepted',
  'system', 'compliance_drop'
);

-- ============================================================================
-- TABLES — Notifications
-- ============================================================================

create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category notification_category not null,
  priority notification_priority not null default 'normal',
  title text not null,
  body text,
  action_url text,              -- deep link to the relevant page
  action_label text,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  channel notification_channel not null default 'in_app',
  email_sent boolean not null default false,
  email_sent_at timestamptz,
  push_sent boolean not null default false,
  push_sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- User notification preferences
create table public.notification_preferences (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category notification_category not null,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default true,
  push_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, category)
);

-- Notification templates (editor data, per category + locale)
create table public.notification_templates (
  id uuid primary key default uuid_generate_v4(),
  category notification_category not null,
  locale text not null default 'fr',
  subject text not null,
  body text not null,
  action_label text,
  created_at timestamptz not null default now(),
  unique(category, locale)
);

-- Reminders (scheduled, recurring)
create table public.reminders (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null,     -- 'task', 'document', 'certificate', 'calibration', 'audit', 'training'
  entity_id uuid not null,
  user_id uuid references auth.users(id) on delete cascade,
  remind_at timestamptz not null,
  is_sent boolean not null default false,
  sent_at timestamptz,
  rrule text,                    -- for recurring reminders
  created_at timestamptz not null default now()
);

-- Expiry tracking (documents, certificates, calibrations, training)
create table public.expiry_tracking (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null,     -- 'document', 'certificate', 'calibration', 'training', 'license'
  entity_id uuid not null,
  entity_name text not null,
  expires_at date not null,
  reminder_days integer[] not null default '{30, 15, 7, 1}',  -- days before expiry to send reminders
  owner_id uuid references auth.users(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_notifications_user on public.notifications(user_id, is_read);
create index idx_notifications_tenant on public.notifications(tenant_id);
create index idx_notifications_category on public.notifications(category);
create index idx_notifications_created on public.notifications(created_at desc);
create index idx_notification_preferences_user on public.notification_preferences(user_id);
create index idx_reminders_tenant on public.reminders(tenant_id);
create index idx_reminders_pending on public.reminders(remind_at) where is_sent = false;
create index idx_expiry_tracking_tenant on public.expiry_tracking(tenant_id);
create index idx_expiry_tracking_expires on public.expiry_tracking(expires_at) where is_active = true;
create index idx_expiry_tracking_entity on public.expiry_tracking(entity_type, entity_id);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_templates enable row level security;
alter table public.reminders enable row level security;
alter table public.expiry_tracking enable row level security;

-- Notifications: users see their own
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

create policy notifications_update on public.notifications
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  )
  with check (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

create policy notifications_delete on public.notifications
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

-- Notification preferences: users manage their own
create policy notification_preferences_select on public.notification_preferences
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

create policy notification_preferences_insert on public.notification_preferences
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

create policy notification_preferences_update on public.notification_preferences
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  )
  with check (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

create policy notification_preferences_delete on public.notification_preferences
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

-- Notification templates: readable by all authenticated
create policy notification_templates_select on public.notification_templates
  for select to authenticated using (true);

-- Reminders: filtered by tenant
create policy reminders_select on public.reminders
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      user_id = (select auth.uid())
      or public.has_role(array['super_admin', 'tenant_admin', 'quality_manager'])
    )
  );

create policy reminders_insert on public.reminders
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin', 'process_owner'])
  );

create policy reminders_update on public.reminders
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy reminders_delete on public.reminders
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Expiry tracking: filtered by tenant
create policy expiry_tracking_select on public.expiry_tracking
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy expiry_tracking_insert on public.expiry_tracking
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy expiry_tracking_update on public.expiry_tracking
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy expiry_tracking_delete on public.expiry_tracking
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- ============================================================================
-- FUNCTION: create_notification
-- ============================================================================
-- Centralized function to create notifications respecting user preferences.
-- ============================================================================

create or replace function public.create_notification(
  p_tenant_id uuid,
  p_user_id uuid,
  p_category notification_category,
  p_title text,
  p_body text default null,
  p_action_url text default null,
  p_action_label text default null,
  p_priority notification_priority default 'normal',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_pref record;
  v_in_app boolean := true;
  v_email boolean := true;
  v_push boolean := false;
begin
  -- Check user preferences
  select * into v_pref
  from public.notification_preferences
  where user_id = p_user_id and category = p_category;

  if found then
    v_in_app := v_pref.in_app_enabled;
    v_email := v_pref.email_enabled;
    v_push := v_pref.push_enabled;
  end if;

  -- Only create if at least one channel is enabled
  if not (v_in_app or v_email or v_push) then
    return null;
  end if;

  insert into public.notifications (
    tenant_id, user_id, category, priority,
    title, body, action_url, action_label, metadata,
    channel
  )
  values (
    p_tenant_id, p_user_id, p_category, p_priority,
    p_title, p_body, p_action_url, p_action_label, p_metadata,
    case
      when v_email then 'email'
      when v_push then 'push'
      else 'in_app'
    end
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================================
-- FUNCTION: get_unread_count
-- ============================================================================

create or replace function public.get_unread_notification_count(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer from public.notifications
  where user_id = p_user_id and is_read = false
$$;

-- ============================================================================
-- FUNCTION: process_reminders
-- ============================================================================
-- Processes pending reminders and creates notifications.
-- Called by a scheduled job (pg_cron or Edge Function).
-- ============================================================================

create or replace function public.process_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_reminder record;
begin
  for v_reminder in
    select * from public.reminders
    where is_sent = false and remind_at <= now()
  loop
    perform public.create_notification(
      v_reminder.tenant_id,
      v_reminder.user_id,
      'task_due',
      'Rappel: tâche à venir',
      'Vous avez une tâche qui arrive à échéance.',
      '/tenant/tasks/' || v_reminder.entity_id,
      'Voir la tâche'
    );

    update public.reminders
    set is_sent = true, sent_at = now()
    where id = v_reminder.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ============================================================================
-- FUNCTION: check_expiries
-- ============================================================================
-- Checks for expiring documents, certificates, calibrations and creates notifications.
-- ============================================================================

create or replace function public.check_expiries()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_expiry record;
  v_days_until integer;
  v_category notification_category;
  v_priority notification_priority;
  v_title text;
  v_body text;
begin
  for v_expiry in
    select * from public.expiry_tracking
    where is_active = true
  loop
    v_days_until := (v_expiry.expires_at - current_date);

    -- Check if any reminder day matches
    if v_days_until = any(v_expiry.reminder_days) or v_days_until < 0 then
      -- Determine category and priority
      if v_days_until < 0 then
        v_category := case v_expiry.entity_type
          when 'certificate' then 'certificate_expired'
          when 'document' then 'document_expired'
          when 'calibration' then 'calibration_overdue'
          else 'document_expired'
        end;
        v_priority := 'urgent';
        v_title := 'EXPIRÉ: ' || v_expiry.entity_name;
        v_body := 'Cet élément a expiré il y a ' || abs(v_days_until) || ' jour(s).';
      else
        v_category := case v_expiry.entity_type
          when 'certificate' then 'certificate_expiring'
          when 'document' then 'document_expiring'
          when 'calibration' then 'calibration_due'
          else 'document_expiring'
        end;
        v_priority := case when v_days_until <= 7 then 'high' else 'normal' end;
        v_title := 'Expire dans ' || v_days_until || ' jour(s): ' || v_expiry.entity_name;
        v_body := 'Cet élément expire le ' || v_expiry.expires_at::text || '.';
      end if;

      -- Notify owner if set
      if v_expiry.owner_id is not null then
        perform public.create_notification(
          v_expiry.tenant_id,
          v_expiry.owner_id,
          v_category,
          v_title,
          v_body,
          '/tenant/' || v_expiry.entity_type || 's',
          'Voir les détails',
          v_priority
        );
        v_count := v_count + 1;
      end if;

      -- Also notify quality managers
      perform public.create_notification(
        v_expiry.tenant_id,
        m.user_id,
        v_category,
        v_title,
        v_body,
        '/tenant/' || v_expiry.entity_type || 's',
        'Voir les détails',
        v_priority
      )
      from public.memberships m
      where m.tenant_id = v_expiry.tenant_id
        and m.role in ('quality_manager', 'tenant_admin');

      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- ============================================================================
-- FUNCTION: notify_anomaly
-- ============================================================================
-- Creates notifications when anomalies are detected.
-- ============================================================================

create or replace function public.notify_anomaly(
  p_tenant_id uuid,
  p_anomaly_id uuid,
  p_severity text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Notify all quality managers and tenant admins
  perform public.create_notification(
    p_tenant_id,
    m.user_id,
    'anomaly_detected',
    'Anomalie détectée (' || p_severity || ')',
    p_description,
    '/tenant/anomalies',
    'Examiner',
    case p_severity when 'high' then 'urgent' when 'medium' then 'high' else 'normal' end,
    jsonb_build_object('anomaly_id', p_anomaly_id, 'severity', p_severity)
  )
  from public.memberships m
  where m.tenant_id = p_tenant_id
    and m.role in ('quality_manager', 'tenant_admin', 'director');
end;
$$;

-- ============================================================================
-- TRIGGER: Notify on anomaly creation
-- ============================================================================

create or replace function public.on_anomaly_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_anomaly(
    new.tenant_id,
    new.id,
    new.severity,
    coalesce(new.description, 'Anomalie de type: ' || new.type::text)
  );
  return new;
end;
$$;

create trigger trg_on_anomaly_created
  after insert on public.anomaly_flags
  for each row
  execute function public.on_anomaly_created();

-- ============================================================================
-- TRIGGER: Notify on task assignment
-- ============================================================================

create or replace function public.on_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is not null and (old.assigned_to is null or old.assigned_to != new.assigned_to) then
    perform public.create_notification(
      new.tenant_id,
      new.assigned_to,
      'task_assigned',
      'Nouvelle tâche assignée: ' || new.title,
      'Vous avez une nouvelle tâche à réaliser.',
      '/tenant/tasks/' || new.id,
      'Voir la tâche',
      'normal'
    );
  end if;

  -- Notify on overdue
  if new.status = 'overdue' and (old.status is null or old.status != 'overdue') then
    if new.assigned_to is not null then
      perform public.create_notification(
        new.tenant_id,
        new.assigned_to,
        'task_overdue',
        'Tâche en retard: ' || new.title,
        'Cette tâche a dépassé sa date d''échéance.',
        '/tenant/tasks/' || new.id,
        'Voir la tâche',
        'high'
      );
    end if;
  end if;

  -- Notify on rejection
  if new.status = 'rejected' and (old.status is null or old.status != 'rejected') then
    if new.assigned_to is not null then
      perform public.create_notification(
        new.tenant_id,
        new.assigned_to,
        'task_rejected',
        'Tâche rejetée: ' || new.title,
        coalesce(new.rejection_reason, 'La tâche a été rejetée. Veuillez corriger et resoumettre.'),
        '/tenant/tasks/' || new.id,
        'Voir la tâche',
        'high'
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_on_task_assigned
  after insert or update on public.tasks
  for each row
  execute function public.on_task_assigned();

-- ============================================================================
-- SEED: Notification templates (FR + EN)
-- ============================================================================

insert into public.notification_templates (category, locale, subject, body, action_label) values
-- French
('task_due', 'fr', 'Rappel: tâche à venir', 'Vous avez une tâche qui arrive à échéance: {{task_title}}', 'Voir la tâche'),
('task_overdue', 'fr', 'Tâche en retard', 'La tâche "{{task_title}}" a dépassé son échéance.', 'Voir la tâche'),
('task_assigned', 'fr', 'Nouvelle tâche assignée', 'Vous avez été assigné à la tâche: {{task_title}}', 'Voir la tâche'),
('task_rejected', 'fr', 'Tâche rejetée', 'La tâche "{{task_title}}" a été rejetée. Motif: {{reason}}', 'Voir la tâche'),
('evidence_verified', 'fr', 'Preuve vérifiée', 'Votre preuve pour "{{task_title}}" a été vérifiée avec succès.', 'Voir la tâche'),
('evidence_rejected', 'fr', 'Preuve rejetée', 'Votre preuve pour "{{task_title}}" a été rejetée.', 'Voir la tâche'),
('document_expiring', 'fr', 'Document expirant bientôt', 'Le document "{{doc_name}}" expire dans {{days}} jour(s).', 'Voir le document'),
('document_expired', 'fr', 'Document expiré', 'Le document "{{doc_name}}" a expiré.', 'Voir le document'),
('certificate_expiring', 'fr', 'Certificat expirant bientôt', 'Le certificat "{{cert_name}}" expire dans {{days}} jour(s).', 'Voir le certificat'),
('certificate_expired', 'fr', 'Certificat expiré', 'Le certificat "{{cert_name}}" a expiré. Action requise.', 'Voir le certificat'),
('calibration_due', 'fr', 'Étalonnage à prévoir', 'L''étalonnage de "{{equipment_name}}" est à prévoir dans {{days}} jour(s).', 'Voir l''équipement'),
('calibration_overdue', 'fr', 'Étalonnage en retard', 'L''étalonnage de "{{equipment_name}}" est en retard.', 'Voir l''équipement'),
('audit_scheduled', 'fr', 'Audit planifié', 'Un audit est planifié le {{date}}.', 'Voir l''audit'),
('nc_opened', 'fr', 'Non-conformité ouverte', 'Une non-conformité a été ouverte: {{nc_title}}', 'Voir la NC'),
('nc_overdue', 'fr', 'Non-conformité en retard', 'La NC "{{nc_title}}" n''a pas été traitée dans les délais.', 'Voir la NC'),
('anomaly_detected', 'fr', 'Anomalie détectée', 'Une anomalie a été détectée: {{description}}', 'Examiner'),
('verification_required', 'fr', 'Vérification requise', 'Une tâche requiert votre vérification.', 'Voir les tâches'),
('training_due', 'fr', 'Formation à prévoir', 'Une formation est à prévoir pour {{person_name}}.', 'Voir les formations'),
('review_due', 'fr', 'Revue de direction à planifier', 'La revue de direction annuelle est à planifier.', 'Planifier'),
('compliance_drop', 'fr', 'Baisse de conformité', 'Le score de conformité a baissé de {{delta}}%.', 'Voir le tableau'),
-- English
('task_due', 'en', 'Reminder: upcoming task', 'You have a task due soon: {{task_title}}', 'View task'),
('task_overdue', 'en', 'Task overdue', 'Task "{{task_title}}" is past its due date.', 'View task'),
('task_assigned', 'en', 'New task assigned', 'You have been assigned to: {{task_title}}', 'View task'),
('task_rejected', 'en', 'Task rejected', 'Task "{{task_title}}" has been rejected. Reason: {{reason}}', 'View task'),
('evidence_verified', 'en', 'Evidence verified', 'Your evidence for "{{task_title}}" has been verified.', 'View task'),
('evidence_rejected', 'en', 'Evidence rejected', 'Your evidence for "{{task_title}}" has been rejected.', 'View task'),
('document_expiring', 'en', 'Document expiring soon', 'Document "{{doc_name}}" expires in {{days}} day(s).', 'View document'),
('document_expired', 'en', 'Document expired', 'Document "{{doc_name}}" has expired.', 'View document'),
('certificate_expiring', 'en', 'Certificate expiring soon', 'Certificate "{{cert_name}}" expires in {{days}} day(s).', 'View certificate'),
('certificate_expired', 'en', 'Certificate expired', 'Certificate "{{cert_name}}" has expired. Action required.', 'View certificate'),
('calibration_due', 'en', 'Calibration due', 'Calibration of "{{equipment_name}}" is due in {{days}} day(s).', 'View equipment'),
('calibration_overdue', 'en', 'Calibration overdue', 'Calibration of "{{equipment_name}}" is overdue.', 'View equipment'),
('audit_scheduled', 'en', 'Audit scheduled', 'An audit is scheduled on {{date}}.', 'View audit'),
('nc_opened', 'en', 'Nonconformity opened', 'A nonconformity has been opened: {{nc_title}}', 'View NC'),
('nc_overdue', 'en', 'Nonconformity overdue', 'NC "{{nc_title}}" has not been addressed in time.', 'View NC'),
('anomaly_detected', 'en', 'Anomaly detected', 'An anomaly has been detected: {{description}}', 'Review'),
('verification_required', 'en', 'Verification required', 'A task requires your verification.', 'View tasks'),
('training_due', 'en', 'Training due', 'Training is due for {{person_name}}.', 'View training'),
('review_due', 'en', 'Management review due', 'The annual management review needs to be scheduled.', 'Schedule'),
('compliance_drop', 'en', 'Compliance drop', 'Compliance score has dropped by {{delta}}%.', 'View dashboard'),
-- Arabic
('task_due', 'ar', 'تذكير: مهمة قادمة', 'لديك مهمة تستحق قريباً: {{task_title}}', 'عرض المهمة'),
('task_overdue', 'ar', 'مهمة متأخرة', 'المهمة "{{task_title}}" تجاوزت موعد استحقاقها.', 'عرض المهمة'),
('task_assigned', 'ar', 'مهمة جديدة مسندة', 'تم إسناد مهمة إليك: {{task_title}}', 'عرض المهمة'),
('task_rejected', 'ar', 'مهمة مرفوضة', 'تم رفض المهمة "{{task_title}}". السبب: {{reason}}', 'عرض المهمة'),
('evidence_verified', 'ar', 'تم التحقق من الدليل', 'تم التحقق من دليلك للمهمة "{{task_title}}" بنجاح.', 'عرض المهمة'),
('evidence_rejected', 'ar', 'تم رفض الدليل', 'تم رفض دليلك للمهمة "{{task_title}}".', 'عرض المهمة'),
('document_expiring', 'ar', 'وثيقة تنتهي قريباً', 'الوثيقة "{{doc_name}}" تنتهي خلال {{days}} يوم(s).', 'عرض الوثيقة'),
('document_expired', 'ar', 'وثيقة منتهية', 'انتهت الوثيقة "{{doc_name}}".', 'عرض الوثيقة'),
('certificate_expiring', 'ar', 'شهادة تنتهي قريباً', 'الشهادة "{{cert_name}}" تنتهي خلال {{days}} يوم(s).', 'عرض الشهادة'),
('certificate_expired', 'ar', 'شهادة منتهية', 'انتهت الشهادة "{{cert_name}}". مطلوب إجراء.', 'عرض الشهادة'),
('calibration_due', 'ar', 'معايرة قادمة', 'معايرة "{{equipment_name}}" مقررة خلال {{days}} يوم(s).', 'عرض المعدات'),
('calibration_overdue', 'ar', 'معايرة متأخرة', 'معايرة "{{equipment_name}}" متأخرة.', 'عرض المعدات'),
('audit_scheduled', 'ar', 'تدقيق مجدول', 'تم جدولة تدقيق في {{date}}.', 'عرض التدقيق'),
('nc_opened', 'ar', 'عدم مطابقة مفتوحة', 'تم فتح عدم مطابقة: {{nc_title}}', 'عرض عدم المطابقة'),
('nc_overdue', 'ar', 'عدم مطابقة متأخرة', 'عدم المطابقة "{{nc_title}}" لم تتم معالجتها في الوقت المحدد.', 'عرض عدم المطابقة'),
('anomaly_detected', 'ar', 'تم اكتشاف شذوذ', 'تم اكتشاف شذوذ: {{description}}', 'مراجعة'),
('verification_required', 'ar', 'تحقق مطلوب', 'مهمة تتطلب التحقق الخاص بك.', 'عرض المهام'),
('training_due', 'ar', 'تدريب قادم', 'تدريب مقرر لـ {{person_name}}.', 'عرض التدريبات'),
('review_due', 'ar', 'مراجعة الإدارة مستحقة', 'يجب جدولة المراجعة السنوية للإدارة.', 'جدولة'),
('compliance_drop', 'ar', 'انخفاض المطابقة', 'انخفض score المطابقة بنسبة {{delta}}%.', 'عرض لوحة التحكم'),
-- Somali
('task_due', 'so', 'Xasuus: hawl soo socota', 'Waxaa haysataa hawl dhameyshto dhawaan: {{task_title}}', 'Eeg hawl'),
('task_overdue', 'so', 'Hawl daahsoon', 'Hawl "{{task_title}}" waa ka baxday taariikhda.', 'Eeg hawl'),
('task_assigned', 'so', 'Hawl cusub la xiray', 'Waxaa laguu xiray: {{task_title}}', 'Eeg hawl'),
('task_rejected', 'so', 'Hawl la diiday', 'Hawl "{{task_title}}" waa la diiday. Sababta: {{reason}}', 'Eeg hawl'),
('evidence_verified', 'so', 'Caddaynta la xaqiijiyay', 'Caddayntaada hawl "{{task_title}}" waa la xaqiijiyay.', 'Eeg hawl'),
('evidence_rejected', 'so', 'Caddayn la diiday', 'Caddayntaada hawl "{{task_title}}" waa la diiday.', 'Eeg hawl'),
('document_expiring', 'so', 'Dukumiinti dhamaysanaya', 'Dukumiintiga "{{doc_name}}" wuxuu dhamaysanayaa {{days}} maalmood gudahood.', 'Eeg dukumiintiga'),
('document_expired', 'so', 'Dukumiinti dhamaa', 'Dukumiintiga "{{doc_name}}" wuu dhamaa.', 'Eeg dukumiintiga'),
('certificate_expiring', 'so', 'Shahaado dhamaysaysa', 'Shahaadada "{{cert_name}}" waxay dhamaysanaysaa {{days}} maalmood gudahood.', 'Eeg shahaada'),
('certificate_expired', 'so', 'Shahaado dhamaysay', 'Shahaadada "{{cert_name}}" waa dhamaysay. Hawlo laga baahan yahay.', 'Eeg shahaada'),
('calibration_due', 'so', 'Cabbir soo socda', 'Cabbirka "{{equipment_name}}" waa la qabtay {{days}} maalmood gudahood.', 'Eeg qalabka'),
('calibration_overdue', 'so', 'Cabbir daahsoon', 'Cabbirka "{{equipment_name}}" waa daahaa.', 'Eeg qalabka'),
('audit_scheduled', 'so', 'Baaris la qorsheeyay', 'Baaris ayaa la qorsheeyay {{date}}.', 'Eeg baarista'),
('nc_opened', 'so', 'NC la furay', 'Caqabad la mid-aanayn ayaa la furay: {{nc_title}}', 'Eeg NC'),
('nc_overdue', 'so', 'NC daahsoon', 'NC "{{nc_title}}" lama xilsaarin waqtigii.', 'Eeg NC'),
('anomaly_detected', 'so', 'Anomaly la ogaaday', 'Anomaly waa la ogaaday: {{description}}', 'Dib u eeg'),
('verification_required', 'so', 'Xaqiijin loo baahan yahay', 'Hawl ayaa u baahan xaqiijintaada.', 'Eeg hawlaha'),
('training_due', 'so', 'Tababar soo socda', 'Tababar ayaa loo qorsheeyay {{person_name}}.', 'Eeg tababarka'),
('review_due', 'so', 'Dib-u-eeg maamul', 'Dib-u-eegta sanadlaha ee maamulka waa in la qorsheeyaa.', 'Qorshee'),
('compliance_drop', 'so', 'Hoos-u-dhac compliance', 'Score compliance ayaa hoos u dhacay {{delta}}%.', 'Eeg dashboard');

-- ============================================================================
-- UPDATED_AT triggers
-- ============================================================================

create trigger trg_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create trigger trg_expiry_tracking_updated_at
  before update on public.expiry_tracking
  for each row execute function public.set_updated_at();
