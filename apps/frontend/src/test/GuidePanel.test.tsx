import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

/** Guide « Que faire ici ? » : étapes calculées par le serveur, notice, question libre. */
const { mockGuideApi } = vi.hoisted(() => ({ mockGuideApi: { get: vi.fn(), ask: vi.fn() } }))
vi.mock('@/lib/api', () => ({ guideApi: mockGuideApi, GUIDE_REFRESH_EVENT: 'qualidji:data-changed' }))

import { GuidePanel } from '@/components/GuidePanel'
import { screenForPath } from '@/lib/guideScreen'

const QM_GUIDE = {
  guide: {
    screen: 'dashboard',
    role: 'quality_manager',
    title: 'Tableau de bord',
    purpose: 'Votre point de départ.',
    steps: [
      { id: 'approve-actions', status: 'todo', label: '2 actions soumises à valider', count: 2, link: '/workflow/x1', detail: 'Ouvrez l’action.' },
      { id: 'launch-action', status: 'info', label: 'Lancer une action', detail: 'Nouvelle action.' },
      { id: 'nc-capa', status: 'done', label: 'Toutes les NC ont un plan CAPA' },
    ],
    next: { id: 'approve-actions', status: 'todo', label: '2 actions soumises à valider' },
    manual: ['6.3'],
  },
  role_label: 'Responsable qualité',
  manual: [{ id: '6.3', title: 'QM — valider ou rejeter', text: 'Ouvrir une action Soumise, relire les réponses.' }],
}

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><GuidePanel /></MemoryRouter>)
}

describe('GuidePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mockGuideApi.get.mockResolvedValue(QM_GUIDE)
  })

  it('associe chaque chemin du menu à un écran', () => {
    expect(screenForPath('/dashboard')).toEqual({ screen: 'dashboard', actionId: null })
    expect(screenForPath('/workflow')).toEqual({ screen: 'workflow', actionId: null })
    expect(screenForPath('/workflow/abc')).toEqual({ screen: 'action', actionId: 'abc' })
    expect(screenForPath('/reviews/')).toEqual({ screen: 'reviews', actionId: null })
    expect(screenForPath('/login')).toBeNull()
  })

  it('affiche le rôle, les étapes et met en avant la prochaine', async () => {
    renderAt('/dashboard')
    expect(await screen.findByText('2 actions soumises à valider')).toBeInTheDocument()
    expect(mockGuideApi.get).toHaveBeenCalledWith('dashboard', null)
    expect(screen.getByText(/Responsable qualité/)).toBeInTheDocument()
    expect(screen.getByText('Maintenant')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir →' })).toHaveAttribute('href', '/workflow/x1')
    // Le détail d'une étape « faite » n'est pas répété
    expect(screen.getByText('Toutes les NC ont un plan CAPA')).toBeInTheDocument()
  })

  it('passe l’action ouverte au serveur', async () => {
    renderAt('/workflow/abc')
    await waitFor(() => expect(mockGuideApi.get).toHaveBeenCalledWith('action', 'abc'))
  })

  it('ouvre la section de la notice', async () => {
    renderAt('/dashboard')
    await userEvent.click(await screen.findByText(/§6.3/))
    expect(screen.getByText('Ouvrir une action Soumise, relire les réponses.')).toBeInTheDocument()
  })

  it('se replie en gardant la prochaine étape visible, et s’en souvient', async () => {
    renderAt('/dashboard')
    await screen.findByText('2 actions soumises à valider')
    await userEvent.click(screen.getByRole('button', { name: 'Masquer le guide' }))
    expect(screen.getByText('Prochaine étape : 2 actions soumises à valider')).toBeInTheDocument()
    expect(window.localStorage.getItem('qualidji-guide-collapsed')).toBe('1')
  })

  it('se recalcule après une écriture réussie', async () => {
    renderAt('/dashboard')
    await screen.findByText('2 actions soumises à valider')
    vi.useFakeTimers()
    act(() => { window.dispatchEvent(new Event('qualidji:data-changed')) })
    await act(async () => { vi.advanceTimersByTime(500) })
    vi.useRealTimers()
    expect(mockGuideApi.get).toHaveBeenCalledTimes(2)
  })

  it('répond à « Comment faire… ? » en signalant le mode notice', async () => {
    mockGuideApi.ask.mockResolvedValue({
      answer: 'D’après la notice (§6.3) :',
      steps: ['Ouvrir une action Soumise', 'Approuver ou Rejeter'],
      sources: [{ id: 'notice:6.3', title: 'Notice §6.3 — QM — valider ou rejeter', kind: 'notice' }],
      warnings: ['Aucun fournisseur IA configuré — réponse tirée de la notice d’utilisation.'],
      confidence_label: 'medium',
      degraded: true,
      model: 'notice-fallback',
    })
    renderAt('/dashboard')
    await screen.findByText('2 actions soumises à valider')
    await userEvent.type(screen.getByLabelText('Comment faire… ?'), 'comment valider une action')
    await userEvent.click(screen.getByRole('button', { name: /Demander/ }))
    expect(mockGuideApi.ask).toHaveBeenCalledWith('dashboard', 'comment valider une action', null)
    expect(await screen.findByText('Approuver ou Rejeter')).toBeInTheDocument()
    expect(screen.getByText(/assistant IA non configuré/)).toBeInTheDocument()
    expect(screen.getByText(/Sources : Notice §6.3/)).toBeInTheDocument()
  })

  it('affiche le refus du serveur (donnée personnelle)', async () => {
    mockGuideApi.ask.mockRejectedValue(new Error('Retirez la donnée personnelle de votre question (adresse e-mail)'))
    renderAt('/dashboard')
    await screen.findByText('2 actions soumises à valider')
    await userEvent.type(screen.getByLabelText('Comment faire… ?'), 'écrire à a@b.fr')
    await userEvent.click(screen.getByRole('button', { name: /Demander/ }))
    expect(await screen.findByText(/Retirez la donnée personnelle/)).toBeInTheDocument()
  })

  it('n’affiche rien hors des écrans du menu', () => {
    const { container } = renderAt('/login')
    expect(container).toBeEmptyDOMElement()
    expect(mockGuideApi.get).not.toHaveBeenCalled()
  })
})
