-- ============================================================================
-- Migration 0007 : RBAC — corrections post-0006 (V5 §3.2/§3.3)
--   P2 : policy employee_actions_select (0004) référencie l'ancien rôle 'admin',
--        remplacé par 'tenant_admin' en 0006 → la policy était morte.
--        On aligne la liste sur les détenteurs de action.assign (0006).
--   Permission tenant.read : nécessaire à GET /api/v1/tenants/me (requirePermission),
--        accordée à tous les rôles de scope tenant (les rôles platform bypassent).
-- Idempotent : peut être exécuté plusieurs fois sans erreur.
-- ============================================================================

-- 1) Fix de la policy 0004 : rôles V5 (plus de 'admin')
drop policy if exists "employee_actions_select" on public.actions;

create policy employee_actions_select on public.actions for select using (
  tenant_id in (select tenant_id from public.user_profiles where id = auth.uid())
  and (
    assigned_to = auth.uid()
    or exists (
      select 1 from public.user_profiles
      where id = auth.uid()
        -- Détenteurs de action.assign (0006) + tenant_admin : vue exhaustive du tenant
        and role in ('tenant_admin', 'quality_manager', 'site_manager',
                     'department_manager', 'consultant')
    )
  )
);

-- 2) Permission tenant.read (GET /tenants/me)
insert into public.permissions (code, description) values
('tenant.read', 'Lire la configuration et les paramètres du tenant courant')
on conflict (code) do nothing;

-- Accordée à tous les rôles de scope tenant (les rôles platform : bypass total)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.scope_level = 'tenant'
  and p.code = 'tenant.read'
on conflict do nothing;
