import type { AuthedRequest } from '../middleware/auth'

const PLATFORM_ADMINS = ['super_admin', 'technical_admin']

export function isPlatformAdmin(req: AuthedRequest): boolean {
  return PLATFORM_ADMINS.includes(req.user?.role ?? '')
}

/** Vue exhaustive du tenant : détenteurs de action.assign — miroir de la politique RLS actions_select (0014). */
export function canSeeAllActions(req: AuthedRequest): boolean {
  return isPlatformAdmin(req) || (req.permissions?.has('action.assign') ?? false)
}

/** Un exécutant ne voit que ses actions ; un gestionnaire voit tout le tenant. */
export function canSeeAction(req: AuthedRequest, action: { assigned_to?: string | null }): boolean {
  return canSeeAllActions(req) || action.assigned_to === req.user?.id
}
