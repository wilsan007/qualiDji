import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

/**
 * Page Revues de direction (§9.3) — consolidation depuis les données
 * enregistrées (aucune génération IA), décisions/actions, tenue conditionnelle.
 */
const { mockReviewsApi } = vi.hoisted(() => ({
  mockReviewsApi: {
    list: vi.fn(),
    create: vi.fn(),
    prefill: vi.fn(),
    update: vi.fn(),
    hold: vi.fn(),
  },
}))

vi.mock('@/lib/api', () => ({ reviewsApi: mockReviewsApi }))

import Reviews from '@/pages/Reviews'
import { useAuthStore } from '@/stores/auth'

const REVIEW = {
  id: 'r1',
  title: 'Revue de direction T1 2026',
  status: 'draft',
  inputs: { audits: 3, nc: 2, decisions: 5 },
  decisions: [{ decision: 'Renforcer la formation qualité' }],
  actions: [{ action: 'Plan de formation Q2 — pilote Marc' }],
}

function setPermissions(permissions: string[], role = 'quality_manager') {
  useAuthStore.setState({
    user: { id: 'u1', email: 'qm@test.local', role },
    permissions,
    session: null,
    isLoading: false,
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Reviews />
    </MemoryRouter>,
  )
}

describe('Page Revues de direction (§9.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReviewsApi.list.mockResolvedValue({ reviews: [REVIEW] })
    mockReviewsApi.create.mockResolvedValue({})
    mockReviewsApi.prefill.mockResolvedValue({})
    mockReviewsApi.update.mockResolvedValue({})
    mockReviewsApi.hold.mockResolvedValue({})
  })

  it('affiche les revues et leurs entrées consolidées', async () => {
    setPermissions(['management_review.manage'])
    renderPage()

    expect(await screen.findByText('Revue de direction T1 2026')).toBeInTheDocument()
    // Le panneau détaillé (entrées consolidées) s'affiche après sélection
    await userEvent.click(screen.getByText('Revue de direction T1 2026'))
    // Les entrées proviennent des données enregistrées, pas d'un texte IA
    expect(screen.getByText(/"audits": 3/)).toBeInTheDocument()
  })

  it('affiche les décisions et les actions issues de la revue', async () => {
    setPermissions(['management_review.manage'])
    renderPage()

    await screen.findByText('Revue de direction T1 2026')
    // Le détail est dépliable : sélection de la revue
    await userEvent.click(screen.getByText('Revue de direction T1 2026'))
    expect(screen.getByText('Renforcer la formation qualité')).toBeInTheDocument()
    expect(screen.getByText('Plan de formation Q2 — pilote Marc')).toBeInTheDocument()
  })

  it('permet d ajouter une décision', async () => {
    setPermissions(['management_review.manage'])
    renderPage()

    await screen.findByText('Revue de direction T1 2026')
    await userEvent.click(screen.getByText('Revue de direction T1 2026'))
    await userEvent.type(screen.getByPlaceholderText('Nouvelle décision…'), 'Prioriser le SMQ')
    // Deux boutons « + » coexistent (décision / action) : on cible celui des décisions
    await userEvent.click(screen.getAllByRole('button', { name: '+' })[0])

    await waitFor(() =>
      expect(mockReviewsApi.update).toHaveBeenCalledWith('r1', {
        decisions: [{ decision: 'Renforcer la formation qualité' }, { decision: 'Prioriser le SMQ' }],
      }),
    )
  })

  it('permet d ajouter une action', async () => {
    setPermissions(['management_review.manage'])
    renderPage()

    await screen.findByText('Revue de direction T1 2026')
    await userEvent.click(screen.getByText('Revue de direction T1 2026'))
    await userEvent.type(screen.getByPlaceholderText('Nouvelle action avec responsable…'), 'Audit interne processes')
    // Deuxième bouton « + » : celui des actions
    await userEvent.click(screen.getAllByRole('button', { name: '+' })[1])

    await waitFor(() =>
      expect(mockReviewsApi.update).toHaveBeenCalledWith('r1', {
        actions: [{ action: 'Plan de formation Q2 — pilote Marc' }, { action: 'Audit interne processes' }],
      }),
    )
  })

  it('un rôle sans management_review.manage ne peut pas créer de revue', async () => {
    setPermissions(['action.read'], 'operator')
    renderPage()

    await screen.findByText('Revue de direction T1 2026')
    expect(screen.queryByPlaceholderText('Titre de la revue *')).not.toBeInTheDocument()
  })

  it('la consolidation appelle le endpoint prefill', async () => {
    setPermissions(['management_review.manage'])
    renderPage()

    await screen.findByText('Revue de direction T1 2026')
    await userEvent.click(screen.getByRole('button', { name: /Consolider/ }))
    await waitFor(() => expect(mockReviewsApi.prefill).toHaveBeenCalledWith('r1'))
  })

  it('propage l erreur de tenue bloquée (409)', async () => {
    setPermissions(['management_review.manage'])
    mockReviewsApi.hold.mockRejectedValue(new Error('tenue impossible : entrées et décisions requises'))
    renderPage()

    await screen.findByText('Revue de direction T1 2026')
    await userEvent.click(screen.getByRole('button', { name: /Marquer tenue/ }))
    expect(await screen.findByText(/tenue impossible/)).toBeInTheDocument()
  })

  it('indique qu aucune revue n existe', async () => {
    setPermissions(['management_review.manage'])
    mockReviewsApi.list.mockResolvedValue({ reviews: [] })
    renderPage()

    expect(await screen.findByText(/Aucune revue/)).toBeInTheDocument()
  })
})
