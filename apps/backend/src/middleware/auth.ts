import { Request, Response, NextFunction } from 'express'
import { createHash } from 'crypto'
import { createSupabaseClient, supabaseAdmin } from '../lib/supabase'

export interface AuthedRequest extends Request {
  user?: { id: string; email?: string; tenant_id?: string; role?: string }
  permissions?: Set<string>
}

// Cache des permissions par rôle (évite de re-interroger la DB à chaque requête).
// M8 : TTL court (30 s par défaut, PERMISSIONS_CACHE_TTL_MS) — une modification de
// role_permissions est effective en quelques secondes, plus en 5 minutes.
const permissionCache = new Map<string, Set<string>>()
const CACHE_TTL_MS = Number(process.env.PERMISSIONS_CACHE_TTL_MS ?? 30_000)
const cacheTimestamps = new Map<string, number>()

/** Vide le cache des permissions (tests, ou après une modification de role_permissions). */
export function invalidatePermissionCache(): void {
  permissionCache.clear()
  cacheTimestamps.clear()
}

// Cache d'authentification (M8) : requireAuth coûtait 2 appels réseau Supabase (getUser + profil)
// par requête. Le résultat est gardé AUTH_CACHE_TTL_MS (10 s par défaut, 0 = désactivé), jamais
// au-delà de l'expiration du jeton, et purgé immédiatement dans CE processus lors d'un changement
// de rôle ou d'une suspension (invalidateAuthCache). Avec plusieurs instances, la révocation est
// effective au plus tard après le TTL.
interface AuthCacheEntry { user: NonNullable<AuthedRequest['user']>; userId: string; expires: number }
const authCache = new Map<string, AuthCacheEntry>()
const AUTH_CACHE_TTL_MS = Number(process.env.AUTH_CACHE_TTL_MS ?? 10_000)
const AUTH_CACHE_MAX = 2000

export function invalidateAuthCache(userId?: string): void {
  if (!userId) { authCache.clear(); return }
  for (const [key, entry] of authCache) if (entry.userId === userId) authCache.delete(key)
}

function tokenExpiryMs(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0
  } catch {
    return 0
  }
}

export async function getPermissionsForRole(role: string): Promise<Set<string>> {
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
  const cacheKey = createHash('sha256').update(token).digest('hex')
  const hit = authCache.get(cacheKey)
  let profileRole: string | undefined
  if (hit && hit.expires > Date.now()) {
    req.user = hit.user
    profileRole = hit.user.role
  } else {
    authCache.delete(cacheKey)
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
    profileRole = profile?.role ?? undefined

    const exp = tokenExpiryMs(token)
    const expires = Math.min(Date.now() + AUTH_CACHE_TTL_MS, exp || Infinity)
    if (AUTH_CACHE_TTL_MS > 0 && expires > Date.now()) {
      if (authCache.size >= AUTH_CACHE_MAX) {
        const now = Date.now()
        for (const [k, v] of authCache) if (v.expires <= now) authCache.delete(k)
        if (authCache.size >= AUTH_CACHE_MAX) authCache.clear()
      }
      authCache.set(cacheKey, { user: req.user, userId: data.user.id, expires })
    }
  }

  // Pré-charger les permissions pour la suite du pipeline
  if (profileRole) {
    req.permissions = await getPermissionsForRole(profileRole)
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

