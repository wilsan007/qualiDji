import { useAuthStore } from '@/stores/auth'

/** Rôles plateforme : bypass total (aligné sur requirePermission côté serveur). */
const ADMIN_ROLES = ['super_admin', 'technical_admin']

/**
 * Habilitations RBAC (V5 §3.3) — pilote le gating UI (boutons, navigation).
 * La source de vérité est GET /api/v1/me (rempli par useAuthStore.fetchProfile) ;
 * le contrôle définitif reste côté serveur (requirePermission).
 */
export function usePermissions() {
  const permissions = useAuthStore((s) => s.permissions)
  const role = useAuthStore((s) => s.user?.role) ?? ''
  const isAdmin = ADMIN_ROLES.includes(role)

  const has = (permission: string) => isAdmin || permissions.includes(permission)
  const hasAny = (...perms: string[]) => isAdmin || perms.some((p) => permissions.includes(p))

  return { has, hasAny, permissions, isAdmin }
}
