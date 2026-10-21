import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/stores/auth'

/**
 * Gating UI RBAC (V5 §3.3) — la source de vérité reste GET /api/v1/me ;
 * le contrôle définitif est côté serveur (requirePermission).
 */
describe('usePermissions — gating UI par permission', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'qm@test.local', role: 'quality_manager' },
      permissions: [],
      session: null,
      isLoading: false,
    })
  })

  it('refuse toute permission absente de la liste', () => {
    useAuthStore.setState({ permissions: ['action.read'] })
    const { result } = renderHook(() => usePermissions())
    expect(result.current.has('action.read')).toBe(true)
    expect(result.current.has('internal_audit.manage')).toBe(false)
  })

  it('hasAny est vrai si au moins une permission est présente', () => {
    useAuthStore.setState({ permissions: ['internal_audit.respond'] })
    const { result } = renderHook(() => usePermissions())
    expect(result.current.hasAny('internal_audit.manage', 'internal_audit.respond')).toBe(true)
    expect(result.current.hasAny('internal_audit.manage', 'management_review.manage')).toBe(false)
  })

  it('bypass total pour les rôles plateforme (super_admin / technical_admin)', () => {
    useAuthStore.setState({ user: { id: 'u2', role: 'super_admin' }, permissions: [] })
    const { result } = renderHook(() => usePermissions())
    expect(result.current.isAdmin).toBe(true)
    expect(result.current.has('internal_audit.manage')).toBe(true)
    expect(result.current.has('nimporte_quelle_permission')).toBe(true)
  })

  it('bypass total pour technical_admin', () => {
    useAuthStore.setState({ user: { id: 'u3', role: 'technical_admin' }, permissions: [] })
    const { result } = renderHook(() => usePermissions())
    expect(result.current.isAdmin).toBe(true)
    expect(result.current.has('management_review.manage')).toBe(true)
  })

  it('n est pas admin pour un rôle tenant (quality_manager)', () => {
    useAuthStore.setState({ user: { id: 'u4', role: 'quality_manager' }, permissions: [] })
    const { result } = renderHook(() => usePermissions())
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.has('internal_audit.manage')).toBe(false)
  })

  it('sans utilisateur, aucune permission', () => {
    useAuthStore.setState({ user: null, permissions: [] })
    const { result } = renderHook(() => usePermissions())
    expect(result.current.has('action.read')).toBe(false)
    expect(result.current.permissions).toEqual([])
  })
})
