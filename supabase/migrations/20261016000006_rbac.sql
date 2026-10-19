-- ============================================================================
-- Migration 0006 : RBAC — rôles, permissions atomiques, mappage rôle→permission
-- Spec V5 §3.2/§3.3 — Permissions définies par rôle, tenant, périmètre et relation objet
-- Chaque endpoint et chaque requête de données doit vérifier l'autorisation côté serveur.
-- Idempotent : peut être exécuté plusieurs fois sans erreur.
-- ============================================================================

-- 1) Table des permissions atomiques
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  created_at timestamptz not null default now()
);

-- 2) Table des rôles
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  scope_level text not null check (scope_level in ('platform', 'tenant')),
  created_at timestamptz not null default now()
);

-- 3) Mappage rôle → permissions
create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

-- 4) Extension de user_profiles : tenant_id nullable (rôles platform sans tenant)
alter table public.user_profiles
  alter column tenant_id drop not null;

-- Recréer la contrainte CHECK avec les nouveaux rôles V5
alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

-- Remapping des anciens rôles (après drop, avant add — l'ancienne contrainte
-- 0005 n'autorisait pas 'tenant_admin')
-- 'admin' → 'tenant_admin' ; 'director' → 'quality_manager'
update public.user_profiles
  set role = 'tenant_admin' where role = 'admin';
update public.user_profiles
  set role = 'quality_manager' where role = 'director';

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in (
    'super_admin', 'technical_admin',
    'tenant_admin', 'quality_manager', 'site_manager', 'department_manager',
    'process_owner', 'operator', 'internal_auditor', 'external_auditor',
    'consultant', 'reader'
  ));

-- Index pour les requêtes de permission fréquentes
create index if not exists idx_role_permissions_role on public.role_permissions (role_id);
create index if not exists idx_role_permissions_permission on public.role_permissions (permission_id);
create index if not exists idx_user_profiles_role on public.user_profiles (role);
create index if not exists idx_user_profiles_tenant_role on public.user_profiles (tenant_id, role);

-- ============================================================================
-- Données de référence : permissions atomiques (V5 §3.3)
-- ============================================================================

insert into public.permissions (code, description) values
-- Workflows
('workflow.read', 'Lire un workflow et ses définitions'),
('workflow.create', 'Créer un nouveau workflow/brouillon'),
('workflow.edit_draft', 'Modifier un brouillon de workflow'),
('workflow.submit_for_approval', 'Soumettre un workflow à approbation'),
('workflow.approve', 'Approuver ou rejeter un workflow'),
-- Actions
('action.read', 'Lire une action et ses détails'),
('action.assign', 'Affecter une action à un utilisateur'),
('action.execute', 'Exécuter/saisir une action assignée'),
('action.submit', 'Soumettre une action complétée'),
('action.approve', 'Approuver ou rejeter une action soumise'),
-- Preuves
('evidence.read', 'Lire une pièce jointe/preuve'),
('evidence.upload', 'Déposer une nouvelle preuve'),
('evidence.export', 'Exporter une preuve ou un registre de preuves'),
-- NC / CAPA
('capa.close', 'Clôturer une CAPA (nécessite vérification d’efficacité)'),
-- Audit / exports
('audit.export', 'Exporter le journal d’audit'),
-- Utilisateurs / tenants
('user.manage', 'Créer, modifier, révoquer des utilisateurs et rôles'),
('tenant.configure', 'Configurer un tenant (sites, départements, paramètres)')
on conflict (code) do nothing;

-- ============================================================================
-- Données de référence : rôles (11 rôles V5 §3.2)
-- ============================================================================

insert into public.roles (code, label, scope_level) values
('super_admin', 'Super administrateur plateforme', 'platform'),
('technical_admin', 'Administrateur technique', 'platform'),
('tenant_admin', 'Administrateur tenant', 'tenant'),
('quality_manager', 'Responsable qualité', 'tenant'),
('site_manager', 'Responsable de site', 'tenant'),
('department_manager', 'Responsable de département', 'tenant'),
('process_owner', 'Propriétaire de processus', 'tenant'),
('operator', 'Opérateur / employé terrain', 'tenant'),
('internal_auditor', 'Auditeur interne', 'tenant'),
('external_auditor', 'Auditeur externe', 'tenant'),
('consultant', 'Consultant / accompagnement', 'tenant'),
('reader', 'Lecteur / observateur', 'tenant')
on conflict (code) do nothing;

-- ============================================================================
-- Mapping rôle → permissions (V5 §3.3)
-- ============================================================================

-- super_admin / technical_admin : toutes les permissions
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code in ('super_admin', 'technical_admin')
on conflict do nothing;

-- tenant_admin : gestion complète du tenant
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'tenant_admin'
  and p.code in (
    'workflow.read','workflow.create','workflow.edit_draft','workflow.submit_for_approval','workflow.approve',
    'action.read','action.assign','action.execute','action.submit','action.approve',
    'evidence.read','evidence.upload','evidence.export',
    'capa.close','audit.export','user.manage','tenant.configure'
  )
on conflict do nothing;

-- quality_manager : gestion qualité (sauf tenant.configure)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'quality_manager'
  and p.code in (
    'workflow.read','workflow.create','workflow.edit_draft','workflow.submit_for_approval','workflow.approve',
    'action.read','action.assign','action.approve',
    'evidence.read','evidence.upload','evidence.export',
    'capa.close','audit.export'
  )
on conflict do nothing;

-- site_manager / department_manager
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code in ('site_manager', 'department_manager')
  and p.code in (
    'workflow.read','workflow.create','workflow.edit_draft',
    'action.read','action.assign','action.execute','action.submit','action.approve',
    'evidence.read','evidence.upload','evidence.export'
  )
on conflict do nothing;

-- process_owner : lecture + exécution sur son périmètre
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'process_owner'
  and p.code in (
    'workflow.read',
    'action.read','action.execute','action.submit',
    'evidence.read','evidence.upload'
  )
on conflict do nothing;

-- operator : exécution uniquement
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'operator'
  and p.code in (
    'workflow.read',
    'action.read','action.execute','action.submit',
    'evidence.read','evidence.upload'
  )
on conflict do nothing;

-- internal_auditor : lecture + export audit + upload preuves
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'internal_auditor'
  and p.code in (
    'workflow.read','action.read',
    'evidence.read','evidence.upload','evidence.export',
    'audit.export'
  )
on conflict do nothing;

-- external_auditor : lecture seule + export
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'external_auditor'
  and p.code in (
    'workflow.read','action.read',
    'evidence.read','evidence.export'
  )
on conflict do nothing;

-- consultant : lecture + création workflow + edit draft + audit export
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'consultant'
  and p.code in (
    'workflow.read','workflow.create','workflow.edit_draft',
    'action.read','action.assign',
    'evidence.read','evidence.upload','evidence.export',
    'audit.export'
  )
on conflict do nothing;

-- reader : lecture seule
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'reader'
  and p.code in ('workflow.read', 'action.read', 'evidence.read')
on conflict do nothing;

-- ============================================================================
-- RLS : tables RBAC lisibles par les utilisateurs authentifiés
-- (le middleware backend vérifie les permissions via le client admin)
-- ============================================================================

alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists "permissions_select_authenticated" on public.permissions;
create policy "permissions_select_authenticated"
  on public.permissions for select to authenticated using (true);

drop policy if exists "roles_select_authenticated" on public.roles;
create policy "roles_select_authenticated"
  on public.roles for select to authenticated using (true);

drop policy if exists "role_permissions_select_authenticated" on public.role_permissions;
create policy "role_permissions_select_authenticated"
  on public.role_permissions for select to authenticated using (true);

grant select on public.permissions to postgres, anon, authenticated, service_role;
grant select on public.roles to postgres, anon, authenticated, service_role;
grant select on public.role_permissions to postgres, anon, authenticated, service_role;