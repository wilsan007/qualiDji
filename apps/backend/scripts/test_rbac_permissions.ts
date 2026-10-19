/**
 * Tests unitaires RBAC (V5 §3.3) — middlewares de src/middleware/auth.ts :
 *   requirePermission / requirePermissions / requireAnyPermission / requireTenant
 *
 * Exécution : npm run test:rbac
 * Hors ligne (aucune DB) : pour les rôles non-admin, req.permissions est pré-rempli,
 * le lazy-load getPermissionsForRole() n'est donc jamais déclenché.
 */
import {
  requirePermission,
  requirePermissions,
  requireAnyPermission,
  requireTenant,
  AuthedRequest,
} from '../src/middleware/auth'
import { Response } from 'express'

let passed = 0
let failed = 0

function assert(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

interface MockRes extends Partial<Response> {
  _status?: number
  _payload?: any
  status(code: number): MockRes
  json(payload: any): MockRes
}

function makeRes(): MockRes {
  const res: MockRes = {
    _status: undefined,
    _payload: undefined,
    status(code: number) {
      res._status = code
      return res
    },
    json(payload: any) {
      res._payload = payload
      return res
    },
  }
  return res
}

function makeReq(opts: {
  user?: AuthedRequest['user'] | null
  permissions?: string[]
}): AuthedRequest {
  const req: AuthedRequest = { headers: {} } as AuthedRequest
  if (opts.user !== null) req.user = opts.user ?? undefined
  if (opts.permissions) req.permissions = new Set(opts.permissions)
  return req
}

async function run() {
  console.log('\n— requirePermission —')

  // 1. Non authentifié → 401
  {
    const req = makeReq({ user: null })
    const res = makeRes()
    await requirePermission('action.read')(req, res as Response, () => {})
    assert('sans utilisateur → 401', res._status === 401, `status=${res._status}`)
  }

  // 2. Bypass plateforme (super_admin) — sans permissions chargées : pas de lazy-load DB
  {
    const req = makeReq({ user: { id: 'u1', role: 'super_admin' } })
    const res = makeRes()
    let nextCalled = false
    await requirePermission('audit.export')(req, res as Response, () => {
      nextCalled = true
    })
    assert('super_admin bypass → next()', nextCalled && res._status === undefined)
    assert('super_admin bypass → aucun chargement de permissions', req.permissions === undefined)
  }

  // 2b. Bypass technical_admin
  {
    const req = makeReq({ user: { id: 'u2', role: 'technical_admin' } })
    const res = makeRes()
    let nextCalled = false
    await requirePermission('audit.export')(req, res as Response, () => {
      nextCalled = true
    })
    assert('technical_admin bypass → next()', nextCalled)
  }

  // 3. Permission possédée → next()
  {
    const req = makeReq({
      user: { id: 'u3', role: 'quality_manager' },
      permissions: ['audit.export'],
    })
    const res = makeRes()
    let nextCalled = false
    await requirePermission('audit.export')(req, res as Response, () => {
      nextCalled = true
    })
    assert('permission possédée → next()', nextCalled && res._status === undefined)
  }

  // 4. Permission manquante → 403 + code
  {
    const req = makeReq({
      user: { id: 'u4', role: 'operator' },
      permissions: ['action.execute'],
    })
    const res = makeRes()
    let nextCalled = false
    await requirePermission('audit.export')(req, res as Response, () => {
      nextCalled = true
    })
    assert(
      'permission manquante → 403 ERR_PERMISSION_DENIED',
      !nextCalled &&
        res._status === 403 &&
        res._payload?.code === 'ERR_PERMISSION_DENIED' &&
        String(res._payload?.error).includes('audit.export'),
      `status=${res._status} payload=${JSON.stringify(res._payload)}`,
    )
  }

  console.log('\n— requirePermissions (ET logique) —')

  // 5. Toutes les permissions → next()
  {
    const req = makeReq({
      user: { id: 'u5', role: 'tenant_admin' },
      permissions: ['workflow.read', 'action.read'],
    })
    const res = makeRes()
    let nextCalled = false
    await requirePermissions(['workflow.read', 'action.read'])(req, res as Response, () => {
      nextCalled = true
    })
    assert('toutes les permissions → next()', nextCalled)
  }

  // 6. Permission partielle → 403 listant le/les manquantes
  {
    const req = makeReq({
      user: { id: 'u6', role: 'quality_manager' },
      permissions: ['workflow.read'],
    })
    const res = makeRes()
    let nextCalled = false
    await requirePermissions(['workflow.read', 'audit.export'])(req, res as Response, () => {
      nextCalled = true
    })
    assert(
      'permission partielle → 403 listant audit.export',
      !nextCalled &&
        res._status === 403 &&
        String(res._payload?.error).includes('audit.export'),
      JSON.stringify(res._payload),
    )
  }

  console.log('\n— requireAnyPermission (OU logique) —')

  // 7. Une des deux permissions → next()
  {
    const req = makeReq({
      user: { id: 'u7', role: 'operator' },
      permissions: ['action.execute'],
    })
    const res = makeRes()
    let nextCalled = false
    await requireAnyPermission(['action.execute', 'action.approve'])(req, res as Response, () => {
      nextCalled = true
    })
    assert("action.execute seul → next() (action.execute OU action.approve)", nextCalled)
  }

  // 8. Aucune des deux → 403
  {
    const req = makeReq({
      user: { id: 'u8', role: 'reader' },
      permissions: ['workflow.read'],
    })
    const res = makeRes()
    let nextCalled = false
    await requireAnyPermission(['action.execute', 'action.approve'])(req, res as Response, () => {
      nextCalled = true
    })
    assert(
      'aucune des deux → 403',
      !nextCalled && res._status === 403 && res._payload?.code === 'ERR_PERMISSION_DENIED',
      JSON.stringify(res._payload),
    )
  }

  // 9. Bypass plateforme sur requireAnyPermission
  {
    const req = makeReq({ user: { id: 'u9', role: 'super_admin' } })
    const res = makeRes()
    let nextCalled = false
    await requireAnyPermission(['action.execute', 'action.approve'])(req, res as Response, () => {
      nextCalled = true
    })
    assert(
      'super_admin bypass requireAnyPermission → next() sans lazy-load',
      nextCalled && req.permissions === undefined,
    )
  }

  console.log('\n— requireTenant —')

  // 10. Sans tenant → 403 ; avec tenant → next()
  {
    const req = makeReq({ user: { id: 'u10', role: 'quality_manager' } })
    const res = makeRes()
    let nextCalled = false
    requireTenant(req, res as Response, () => {
      nextCalled = true
    })
    assert('sans tenant_id → 403', !nextCalled && res._status === 403)

    const req2 = makeReq({
      user: { id: 'u11', role: 'quality_manager', tenant_id: 't-1' },
    })
    const res2 = makeRes()
    let next2 = false
    requireTenant(req2, res2 as Response, () => {
      next2 = true
    })
    assert('avec tenant_id → next()', next2)
  }

  console.log(`\nRésultat RBAC : ${passed} réussis, ${failed} échec(s).`)
  if (failed > 0) process.exit(1)
}

run().catch((e) => {
  console.error('Erreur fatale des tests RBAC :', e)
  process.exit(1)
})
