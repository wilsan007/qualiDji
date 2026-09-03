-- ============================================================================
-- Migration 0007: Document management — versions, approvals, distribution
-- ============================================================================
-- Domain F: Gestion documentaire
-- Tables: document_categories, documents, document_versions,
--         document_approvals, document_distributions, document_acknowledgements,
--         document_quizzes, document_quiz_responses
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type document_status as enum ('draft', 'in_review', 'approved', 'published', 'archived', 'obsolete');
create type document_type as enum ('policy', 'procedure', 'instruction', 'form', 'record', 'manual', 'plan', 'register', 'other');
create type approval_status as enum ('pending', 'approved', 'rejected');
create type ack_status as enum ('pending', 'acknowledged', 'rejected');

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.document_categories (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  parent_id uuid references public.document_categories(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid references public.document_categories(id) on delete set null,
  code text not null,              -- e.g. 'PROC-001'
  title text not null,
  title_en text,
  title_ar text,
  title_so text,
  type document_type not null default 'procedure',
  status document_status not null default 'draft',
  current_version_id uuid,        -- FK set below after document_versions
  site_ids uuid[] not null default '{}'::uuid[],
  process_ids uuid[] not null default '{}'::uuid[],
  requirement_ids uuid[] not null default '{}'::uuid[],
  retention_period interval,       -- how long to keep after obsolescence
  is_confidential boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, code)
);

create table public.document_versions (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number text not null,   -- e.g. '1.0', '1.1', '2.0'
  storage_path text not null,     -- Supabase Storage path
  file_name text not null,
  file_size bigint,
  mime_type text,
  file_hash text not null,        -- SHA-256
  change_log text,                -- what changed from previous version
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(document_id, version_number)
);

-- Set the FK now that document_versions exists
alter table public.documents
  add constraint documents_current_version_fk
  foreign key (current_version_id) references public.document_versions(id) on delete set null;

create table public.document_approvals (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version_id uuid not null references public.document_versions(id) on delete cascade,
  approver_id uuid not null references auth.users(id),
  role_in_approval text not null default 'reviewer',  -- 'reviewer', 'approver', 'final_approver'
  status approval_status not null default 'pending',
  comment text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(document_id, version_id, approver_id)
);

create table public.document_distributions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version_id uuid not null references public.document_versions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  role user_role,                  -- distribute to everyone with this role
  must_acknowledge boolean not null default true,
  ack_deadline date,               -- by when they must acknowledge
  created_at timestamptz not null default now()
);

create table public.document_acknowledgements (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version_id uuid not null references public.document_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status ack_status not null default 'pending',
  acknowledged_at timestamptz,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  unique(document_id, version_id, user_id)
);

-- Optional quizzes for critical documents
create table public.document_quizzes (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version_id uuid not null references public.document_versions(id) on delete cascade,
  title text not null,
  passing_score integer not null default 70,  -- percentage
  questions jsonb not null default '[]'::jsonb,  -- array of {question, options[], correctIndex}
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.document_quiz_responses (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quiz_id uuid not null references public.document_quizzes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  score integer not null,          -- percentage
  passed boolean not null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(quiz_id, user_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index idx_document_categories_tenant on public.document_categories(tenant_id);
create index idx_documents_tenant on public.documents(tenant_id);
create index idx_documents_status on public.documents(status);
create index idx_documents_category on public.documents(category_id);
create index idx_document_versions_document on public.document_versions(document_id);
create index idx_document_approvals_document on public.document_approvals(document_id);
create index idx_document_approvals_approver on public.document_approvals(approver_id);
create index idx_document_distributions_document on public.document_distributions(document_id);
create index idx_document_distributions_user on public.document_distributions(user_id);
create index idx_document_acknowledgements_user on public.document_acknowledgements(user_id);
create index idx_document_acknowledgements_pending on public.document_acknowledgements(user_id, status);
create index idx_document_quizzes_document on public.document_quizzes(document_id);
create index idx_document_quiz_responses_quiz on public.document_quiz_responses(quiz_id);
create index idx_document_quiz_responses_user on public.document_quiz_responses(user_id);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.document_categories enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_approvals enable row level security;
alter table public.document_distributions enable row level security;
alter table public.document_acknowledgements enable row level security;
alter table public.document_quizzes enable row level security;
alter table public.document_quiz_responses enable row level security;

-- Document categories: all tenant users can see
create policy document_categories_select on public.document_categories
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy document_categories_insert on public.document_categories
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy document_categories_update on public.document_categories
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy document_categories_delete on public.document_categories
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Documents: all tenant users can see published; draft/review restricted
create policy documents_select on public.documents
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      status in ('published', 'archived')
      or created_by = (select auth.uid())
      or public.has_role(array['super_admin', 'tenant_admin', 'quality_manager', 'process_owner'])
    )
  );

create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
  );

create policy documents_update on public.documents
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      created_by = (select auth.uid())
      or public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
    )
  )
  with check (tenant_id = public.current_tenant_id());

create policy documents_delete on public.documents
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Document versions: same access as documents
create policy document_versions_select on public.document_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_versions.document_id
        and d.tenant_id = public.current_tenant_id()
        and (
          d.status in ('published', 'archived')
          or d.created_by = (select auth.uid())
          or public.has_role(array['super_admin', 'tenant_admin', 'quality_manager', 'process_owner'])
        )
    )
  );

create policy document_versions_insert on public.document_versions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_versions.document_id
        and d.tenant_id = public.current_tenant_id()
        and (
          d.created_by = (select auth.uid())
          or public.has_role(array['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'])
        )
    )
  );

-- Document approvals: approvers and managers
create policy document_approvals_select on public.document_approvals
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      approver_id = (select auth.uid())
      or public.has_role(array['super_admin', 'tenant_admin', 'quality_manager'])
    )
  );

create policy document_approvals_insert on public.document_approvals
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy document_approvals_update on public.document_approvals
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and approver_id = (select auth.uid())
  )
  with check (
    tenant_id = public.current_tenant_id()
  );

-- Document distributions: filtered by tenant
create policy document_distributions_select on public.document_distributions
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      user_id = (select auth.uid())
      or public.has_role(array['super_admin', 'tenant_admin', 'quality_manager'])
    )
  );

create policy document_distributions_insert on public.document_distributions
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy document_distributions_delete on public.document_distributions
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

-- Document acknowledgements: users see their own, managers see all
create policy document_acknowledgements_select on public.document_acknowledgements
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      user_id = (select auth.uid())
      or public.has_role(array['super_admin', 'tenant_admin', 'quality_manager'])
    )
  );

create policy document_acknowledgements_insert on public.document_acknowledgements
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

create policy document_acknowledgements_update on public.document_acknowledgements
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  )
  with check (
    tenant_id = public.current_tenant_id()
  );

-- Document quizzes: readable by tenant users
create policy document_quizzes_select on public.document_quizzes
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy document_quizzes_insert on public.document_quizzes
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  );

create policy document_quizzes_update on public.document_quizzes
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'quality_manager', 'super_admin'])
  )
  with check (
    tenant_id = public.current_tenant_id()
  );

create policy document_quizzes_delete on public.document_quizzes
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.has_role(array['tenant_admin', 'super_admin'])
  );

-- Document quiz responses: users see their own, managers see all
create policy document_quiz_responses_select on public.document_quiz_responses
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      user_id = (select auth.uid())
      or public.has_role(array['super_admin', 'tenant_admin', 'quality_manager'])
    )
  );

create policy document_quiz_responses_insert on public.document_quiz_responses
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and user_id = (select auth.uid())
  );

-- ============================================================================
-- TRIGGER: Prevent self-approval (role separation)
-- ============================================================================

create or replace function public.prevent_self_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
begin
  select created_by into v_created_by
  from public.documents
  where id = new.document_id;

  if v_created_by = new.approver_id then
    raise exception 'Role separation violation: cannot approve your own document';
  end if;

  return new;
end;
$$;

create trigger trg_prevent_self_approval
  before insert on public.document_approvals
  for each row
  execute function public.prevent_self_approval();

-- ============================================================================
-- TRIGGER: Auto-publish when all approvals are done
-- ============================================================================

create or replace function public.on_approval_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending_count integer;
  v_all_approved boolean;
  v_document_id uuid;
begin
  v_document_id := new.document_id;

  select
    count(*) filter (where status = 'pending') = 0,
    count(*) filter (where status = 'rejected') = 0
  into v_all_approved, v_pending_count
  from public.document_approvals
  where document_id = v_document_id and version_id = new.version_id;

  if v_all_approved and v_pending_count = 0 then
    -- All approved: publish the document
    update public.documents
    set status = 'published', updated_at = now()
    where id = v_document_id;

    -- Set current version
    update public.documents
    set current_version_id = new.version_id
    where id = v_document_id;

    -- Create notifications for distributed users
    perform public.create_notification(
      public.current_tenant_id(),
      dist.user_id,
      'document_expiring',
      'Nouveau document publié: ' || (select title from public.documents where id = v_document_id),
      'Un nouveau document a été publié et nécessite votre attention.',
      '/tenant/documents/' || v_document_id,
      'Voir le document'
    )
    from public.document_distributions dist
    where dist.document_id = v_document_id
      and dist.version_id = new.version_id
      and dist.user_id is not null;
  end if;

  return new;
end;
$$;

create trigger trg_on_approval_completed
  after update on public.document_approvals
  for each row
  execute function public.on_approval_completed();

-- ============================================================================
-- TRIGGER: Notify on distribution
-- ============================================================================

create or replace function public.on_document_distributed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc_title text;
begin
  select title into v_doc_title from public.documents where id = new.document_id;

  if new.user_id is not null then
    perform public.create_notification(
      new.tenant_id,
      new.user_id,
      'system',
      'Nouveau document à consulter: ' || v_doc_title,
      'Un document vous a été distribué et nécessite votre accusé de lecture.',
      '/tenant/documents/' || new.document_id,
      'Voir le document',
      'normal'
    );
  end if;

  return new;
end;
$$;

create trigger trg_on_document_distributed
  after insert on public.document_distributions
  for each row
  execute function public.on_document_distributed();

-- ============================================================================
-- UPDATED_AT triggers
-- ============================================================================

create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();
