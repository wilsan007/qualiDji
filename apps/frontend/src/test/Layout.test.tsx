import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

/**
 * Layout applicatif — navigation RBAC, bandeau hors-ligne (§13),
 * cloche de notifications et déconnexion.
 */
const { mockNotificationsApi, mockUseOnlineStatus, mockGuideApi } = vi.hoisted(() => ({
  mockNotificationsApi: {
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
  mockUseOnlineStatus: vi.fn(),
  mockGuideApi: { get: vi.fn(), ask: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ notificationsApi: mockNotificationsApi, guideApi: mockGuideApi, GUIDE_REFRESH_EVENT: 'qualidji:data-changed' }))
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: mockUseOnlineStatus }))

import Layout from '@/components/Layout'
import { useAuthStore } from '@/stores/auth'

function setUser(permissions: string[], role = 'quality_manager') {
  useAuthStore.setState({
    user: { id: 'u1', email: 'marie.dupont@test.local', display_name: 'Marie Dupont', role },
    permissions,
    session: 'tok',
    isLoading: false,
  })
}

function renderLayout(path = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<div>Zone de contenu</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNotificationsApi.list.mockResolvedValue({ notifications: [], unread_count: 0 })
    mockNotificationsApi.markRead.mockResolvedValue({})
    mockNotificationsApi.markAllRead.mockResolvedValue({})
    mockUseOnlineStatus.mockReturnValue({ online: true, pending: 0 })
    mockGuideApi.get.mockResolvedValue({
      guide: { screen: 'dashboard', role: 'quality_manager', title: 'Tableau de bord', purpose: 'Point de départ.', steps: [], next: null, manual: [] },
      role_label: 'Responsable qualité',
      manual: [],
    })
  })

  it('affiche la navigation publique et le titre de page', async () => {
    setUser([])
    renderLayout('/dashboard')

    expect(await screen.findByText('Zone de contenu')).toBeInTheDocument()
    expect(screen.getAllByText('Tableau de bord').length).toBeGreaterThan(0)
    expect(screen.getByText('Non-conformités')).toBeInTheDocument()
  })

  it('masque les entrées de navigation sans permission', async () => {
    setUser(['action.read'], 'operator')
    renderLayout('/dashboard')

    await screen.findByText('Zone de contenu')
    expect(screen.queryByText('Audits internes')).not.toBeInTheDocument()
    expect(screen.queryByText('Revues direction')).not.toBeInTheDocument()
    expect(screen.queryByText('Utilisateurs')).not.toBeInTheDocument()
  })

  it('affiche les entrées autorisées par le RBAC', async () => {
    setUser(['internal_audit.respond', 'management_review.manage'])
    renderLayout('/dashboard')

    await screen.findByText('Zone de contenu')
    expect(screen.getByText('Audits internes')).toBeInTheDocument()
    expect(screen.getByText('Revues direction')).toBeInTheDocument()
  })

  it("les gestionnaires d'audit (manage SANS respond : internal_auditor, tenant_admin) voient « Audits internes » (H1)", async () => {
    setUser(['internal_audit.manage'], 'internal_auditor')
    renderLayout('/dashboard')

    await screen.findByText('Zone de contenu')
    expect(screen.getByText('Audits internes')).toBeInTheDocument()
  })

  it('le titre de page suit la route courante', async () => {
    setUser(['internal_audit.respond'])
    renderLayout('/audits')

    await screen.findByText('Zone de contenu')
    expect(screen.getAllByText('Audits internes').length).toBeGreaterThan(0)
  })

  it('affiche le rôle et le périmètre de l utilisateur', async () => {
    setUser([])
    renderLayout('/dashboard')

    await screen.findByText('Zone de contenu')
    expect(screen.getByText('Marie Dupont')).toBeInTheDocument()
    expect(screen.getByText('marie.dupont@test.local')).toBeInTheDocument()
  })

  it('la cloche affiche le compteur de notifications non lues', async () => {
    setUser([])
    mockNotificationsApi.list.mockResolvedValue({
      notifications: [{ id: 'n1', kind: 'action.assigned', title: 'Action à traiter', created_at: new Date().toISOString(), read_at: null }],
      unread_count: 1,
    })
    renderLayout('/dashboard')

    await waitFor(() => expect(screen.getByLabelText(/Notifications \(1 non lues\)/)).toBeInTheDocument())
    await userEvent.click(screen.getByLabelText(/Notifications/))
    expect(screen.getByText('Action assignée')).toBeInTheDocument()
    expect(screen.getByText('Action à traiter')).toBeInTheDocument()
  })

  it('permet de tout marquer comme lu', async () => {
    setUser([])
    mockNotificationsApi.list.mockResolvedValue({
      notifications: [{ id: 'n1', kind: 'action.assigned', title: 'Action à traiter', created_at: new Date().toISOString(), read_at: null }],
      unread_count: 1,
    })
    renderLayout('/dashboard')

    await waitFor(() => expect(screen.getByLabelText(/Notifications/)).toBeInTheDocument())
    await userEvent.click(screen.getByLabelText(/Notifications/))
    await userEvent.click(screen.getByText('Tout marquer lu'))
    await waitFor(() => expect(mockNotificationsApi.markAllRead).toHaveBeenCalled())
  })

  it('affiche le bandeau hors-ligne avec le nombre de saisies en attente', async () => {
    setUser([])
    mockUseOnlineStatus.mockReturnValue({ online: false, pending: 3 })
    renderLayout('/dashboard')

    expect(await screen.findByText(/Mode hors ligne/)).toBeInTheDocument()
    expect(screen.getByText('(3 en attente de synchronisation)')).toBeInTheDocument()
  })

  it('affiche la synchronisation en attente quand la connexion est rétablie', async () => {
    setUser([])
    mockUseOnlineStatus.mockReturnValue({ online: true, pending: 2 })
    renderLayout('/dashboard')

    expect(await screen.findByText(/Synchronisation de 2 saisie\(s\) en attente/)).toBeInTheDocument()
  })

  it('propose la déconnexion', async () => {
    setUser([])
    renderLayout('/dashboard')

    await screen.findByText('Zone de contenu')
    expect(screen.getByRole('button', { name: /Déconnexion/ })).toBeInTheDocument()
  })

  it('ouvre le menu mobile', async () => {
    setUser([])
    renderLayout('/dashboard')

    await screen.findByText('Zone de contenu')
    await userEvent.click(screen.getByLabelText('Ouvrir le menu'))
    expect(screen.getByLabelText('Fermer le menu')).toBeInTheDocument()
  })
})
