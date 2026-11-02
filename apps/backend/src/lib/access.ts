import type { AuthedRequest } from '../middleware/auth'

const PLATFORM_ADMINS = ['super_admin', 'technical_admin']

export function isPlatformAdmin(req: AuthedRequest): boolean {
  return PLATFORM_ADMINS.includes(req.user?.role ?? '')
}

/** Gestion exhaustive du tenant (écriture) : détenteurs de action.assign — miroir de la politique RLS actions_select (0014). */
export function canManageAllActions(req: AuthedRequest): boolean {
  return isPlatformAdmin(req) || (req.permissions?.has('action.assign') ?? false)
}

/**
 * Lecture exhaustive du tenant : gestion (action.assign) ou lecture seule (action.read_all : auditeurs).
 * L'API passe par le service_role ; la lecture directe PostgREST reste plus stricte que l'API (RLS 0014).
 */
export function canSeeAllActions(req: AuthedRequest): boolean {
  return canManageAllActions(req) || (req.permissions?.has('action.read_all') ?? false)
}

/** Un exécutant ne voit que ses actions ; un gestionnaire ou un auditeur (lecture) voit tout le tenant. */
export function canSeeAction(req: AuthedRequest, action: { assigned_to?: string | null }): boolean {
  return canSeeAllActions(req) || action.assigned_to === req.user?.id
}

/** Écriture sur une action (dépôt de preuve…) : ses propres actions ou la gestion — jamais la simple lecture. */
export function canWriteAction(req: AuthedRequest, action: { assigned_to?: string | null }): boolean {
  return canManageAllActions(req) || action.assigned_to === req.user?.id
}
