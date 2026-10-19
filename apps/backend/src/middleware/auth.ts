import { Request, Response, NextFunction } from 'express'
import { createSupabaseClient, supabaseAdmin } from '../lib/supabase'

export interface AuthedRequest extends Request {
  user?: { id: string; email?: string; tenant_id?: string; role?: string }
  permissions?: Set<string>
}

// Cache des permissions par rôle (évite de re-interroger la DB à chaque requête)
const permissionCache = new Map<string, Set<string>>()
const CACHE_TTL_MS = 5 * 60 * 1000
const cacheTimestamps = new Map<string, number>()

async function getPermissionsForRole(role: string): Promise<Set<string>> {
  const now = Date.now()
  const cached = permissionCache.get(role)
  const ts = cacheTimestamps.get(role)
  if (cached && ts && now - ts < CACHE_TTL_MS) return cached

  // Étape 1 : récupérer l'ID du rôle
  const { data: roleRow, error: roleErr } = await supabaseAdmin
    .from('roles')
    .select('id')
    .eq('code', role)
    .single()

  if (roleErr || !roleRow) {
    console.error(`[rbac] role not found: ${role}:`, roleErr?.message)
    return new Set()
  }

  // Étape 2 : récupérer les permissions via PostgREST embedded resource
  const { data, error } = await supabaseAdmin
    .from('role_permissions')
    .select('permission:permissions(code)')
    .eq('role_id', roleRow.id)

  if (error || !data) {
    console.error(`[rbac] failed to load permissions for role ${role}:`, error?.message)
    return new Set()
  }

  const perms = new Set<string>()
  for (const row of data) {
    const perm = row.permission as unknown as { code: string } | null
    if (perm?.code) perms.add(perm.code)
  }
  permissionCache.set(role, perms)
  cacheTimestamps.set(role, now)
  return perms
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing bearer token' })
  }
  const token = authHeader.slice(7)
  const supabase = createSupabaseClient(token)

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return res.status(401).json({ error: 'invalid or expired token' })
  }

  // Récupérer le profil tenant/role
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tenant_id, role')
    .eq('id', data.user.id)
    .single()

  req.user = {
    id: data.user.id,
    email: data.user.email,
    tenant_id: profile?.tenant_id ?? undefined,
    role: profile?.role ?? undefined,
  }

  // Pré-charger les permissions pour la suite du pipeline
  if (profile?.role) {
    req.permissions = await getPermissionsForRole(profile.role)
  } else {
    req.permissions = new Set()
  }

  next()
}

export function requireTenant(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user?.tenant_id) {
    return res.status(403).json({ error: 'user not attached to a tenant' })
  }
  next()
}

// Vérifie une permission atomique (V5 §3.3)
// Les rôles super_admin et technical_admin ont toujours tous les droits.
export function requirePermission(permission: string) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'not authenticated' })
    }

    const role = req.user.role ?? ''

    // Super admin / technical admin : bypass
    if (role === 'super_admin' || role === 'technical_admin') {
      return next()
    }

    // Si permissions pas encore chargées (requireAuth non passé), les charger
    if (!req.permissions) {
      req.permissions = await getPermissionsForRole(role)
    }

    if (!req.permissions.has(permission)) {
      return res.status(403).json({
        error: `missing permission: ${permission}`,
        code: 'ERR_PERMISSION_DENIED',
      })
    }
    next()
  }
}

// Vérifie plusieurs permissions (l'utilisateur doit les avoir toutes)
export function requirePermissions(permissions: string[]) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'not authenticated' })
    }

    const role = req.user.role ?? ''
    if (role === 'super_admin' || role === 'technical_admin') {
      return next()
    }

    if (!req.permissions) {
      req.permissions = await getPermissionsForRole(role)
    }

    const missing = permissions.filter((p) => !req.permissions!.has(p))
    if (missing.length > 0) {
      return res.status(403).json({
        error: `missing permissions: ${missing.join(', ')}`,
        code: 'ERR_PERMISSION_DENIED',
      })
    }
    next()
  }
}

// Vérifie qu'au moins une des permissions est possédée (union — ex. action.execute OU action.approve)
export function requireAnyPermission(permissions: string[]) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'not authenticated' })
    }

    const role = req.user.role ?? ''
    if (role === 'super_admin' || role === 'technical_admin') {
      return next()
    }

    if (!req.permissions) {
      req.permissions = await getPermissionsForRole(role)
    }

    if (!permissions.some((p) => req.permissions!.has(p))) {
      return res.status(403).json({
        error: `missing any of permissions: ${permissions.join(', ')}`,
        code: 'ERR_PERMISSION_DENIED',
      })
    }
    next()
  }
}

