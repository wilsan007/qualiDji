-- ============================================================================
-- Migration 0012 : §8.6 Documents contrôlés (+ corpus RAG §7.6)
--   - registre versionné par tenant : brouillon → revue → approbation →
--     publication → remplacement/dépréciation (cycle §8.6)
--   - classification, date d'effet, approbateur, hash du contenu indexable
--   - supersedes_id : le remplacement crée une nouvelle version liée
--   - permissions document.* alignées sur workflow.* (0006)
-- Idempotent.
-- ============================================================================

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  doc_key text not null,
  title text not null,
  doc_type text not null default 'procedure'
    check (doc_type in ('procedure', 'policy', 'work_instruction', 'form', 'record_reference', 'other')),
  classification text not null default 'internal'
    check (classification in ('public', 'internal', 'confidential', 'secret')),
  owner_role text not null default 'quality_manager',
  version integer not null default 1,
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'published', 'deprecated', 'archived')),
  -- Contenu indexable pour le RAG (§7.6) — minimisé, jamais de donnée sensible
  excerpt text,
  content_sha256 text,
  effective_from timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  change_reason text,
  review_comment text,
  supersedes_id uuid references public.documents (id),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, doc_key, version)
);

create index if not exists documents_tenant_status_idx on public.documents (tenant_id, status);

alter table public.documents enable row level security;

drop policy if exists documents_published_select on public.documents;
create policy documents_published_select on public.documents for select using (
  status = 'published'
  and tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
);

grant select on public.documents to authenticated;
grant all on public.documents to service_role;
grant all on public.documents to postgres;

-- Permissions (cycle miroir workflow.*, 0006)
insert into public.permissions (code, description) values
('document.read', 'Consulter les documents contrôlés publiés'),
('document.create', 'Créer un brouillon de document contrôlé'),
('document.edit_draft', 'Modifier un brouillon de document'),
('document.approve', 'Approuver, publier ou déprécier un document')
on conflict (code) do nothing;

-- document.read : tous les rôles de scope tenant (comme tenant.read en 0007)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.scope_level = 'tenant'
  and p.code = 'document.read'
on conflict do nothing;

-- document.create / document.edit_draft : mêmes détenteurs que workflow.* (0006)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code in ('tenant_admin', 'quality_manager', 'site_manager', 'department_manager', 'consultant')
  and p.code in ('document.create', 'document.edit_draft')
on conflict do nothing;

-- document.approve : qualité + admins (comme workflow.approve)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code in ('tenant_admin', 'quality_manager')
  and p.code = 'document.approve'
on conflict do nothing;
