-- ============================================================================
-- Migration 0013 : §9.2 Audits internes + §9.3 Revues de direction
--   - internal_audits : programme/plan — l'auto-audit est interdit côté API
--     (auditeur ≠ créateur, §F.4 : réaffectation exigée)
--   - audit_findings : constats + réponse du processus SÉPARÉE du constat
--     (« la réponse ne modifie pas le constat original ») + vérification par
--     personne distincte + réouverture si inefficace
--   - management_reviews : entrées, décisions, actions (direction)
-- Idempotent.
-- ============================================================================

create table if not exists public.internal_audits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null,
  scope text not null,
  criteria text not null,
  auditor_id uuid not null references public.user_profiles (id),
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'closed')),
  planned_at timestamptz,
  started_at timestamptz,
  closed_at timestamptz,
  summary text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists internal_audits_tenant_idx on public.internal_audits (tenant_id, status);

create table if not exists public.audit_findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  audit_id uuid not null references public.internal_audits (id) on delete cascade,
  title text not null,
  -- Constat original : immuable après création (§F.4)
  description text not null,
  classification text not null default 'minor'
    check (classification in ('major', 'minor', 'observation')),
  process_owner_id uuid references public.user_profiles (id),
  status text not null default 'open'
    check (status in ('open', 'responded', 'verified_effective', 'reopened', 'closed')),
  -- Réponse de l'organisation (séparée du constat)
  response text,
  corrective_action text,
  due_at timestamptz,
  responded_at timestamptz,
  responded_by uuid,
  -- Vérification par personne distincte (jamais le responsable de l'action)
  verified_by uuid,
  verified_at timestamptz,
  verification_comment text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists audit_findings_audit_idx on public.audit_findings (audit_id, status);

create table if not exists public.management_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'held')),
  scheduled_at timestamptz,
  held_at timestamptz,
  inputs jsonb not null default '{}'::jsonb,
  decisions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists management_reviews_tenant_idx on public.management_reviews (tenant_id, status);

-- RLS : écritures backend service_role ; lecture filtrée tenant
alter table public.internal_audits enable row level security;
alter table public.audit_findings enable row level security;
alter table public.management_reviews enable row level security;

drop policy if exists internal_audits_tenant_select on public.internal_audits;
create policy internal_audits_tenant_select on public.internal_audits for select using (
  tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
);
drop policy if exists audit_findings_tenant_select on public.audit_findings;
create policy audit_findings_tenant_select on public.audit_findings for select using (
  tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
);
drop policy if exists management_reviews_tenant_select on public.management_reviews;
create policy management_reviews_tenant_select on public.management_reviews for select using (
  tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
);

grant select on public.internal_audits, public.audit_findings, public.management_reviews to authenticated;
grant all on public.internal_audits, public.audit_findings, public.management_reviews to service_role;
grant all on public.internal_audits, public.audit_findings, public.management_reviews to postgres;

insert into public.permissions (code, description) values
('internal_audit.manage', 'Créer et piloter les audits internes, enregistrer les constats'),
('internal_audit.respond', 'Répondre aux constats d audit et proposer des actions correctives'),
('management_review.manage', 'Organiser les revues de direction (entrées, décisions, actions)')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code in ('tenant_admin', 'quality_manager', 'internal_auditor')
  and p.code = 'internal_audit.manage'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code in ('quality_manager', 'site_manager', 'department_manager', 'process_owner', 'operator')
  and p.code = 'internal_audit.respond'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code in ('tenant_admin', 'quality_manager')
  and p.code = 'management_review.manage'
on conflict do nothing;

