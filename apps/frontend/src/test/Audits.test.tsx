import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

/**
 * Page Audits internes (§9.2) — gating des actions par permission et
 * respect des règles métier exposées par l'API.
 */
const { mockAuditsApi } = vi.hoisted(() => ({
  mockAuditsApi: {
    list: vi.fn(),
    eligible: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    start: vi.fn(),
    close: vi.fn(),
    addFinding: vi.fn(),
    respond: vi.fn(),
    verify: vi.fn(),
  },
}))

vi.mock('@/lib/api', () => ({ auditsApi: mockAuditsApi }))

import Audits from '@/pages/Audits'
import { useAuthStore } from '@/stores/auth'

const AUDIT = {
  id: 'a1',
  title: 'Audit processus achats',
  scope: 'Achats',
  criteria: 'ISO 9001 §8.2',
  auditor_id: 'u2',
  status: 'in_progress',
  findings: [
    {
      id: 'f1',
      title: 'Écart maîtrise des fournisseurs',
      description: 'Critère non appliqué',
      classification: 'minor',
      status: 'responded',
      response: 'Cause identifiée',
      corrective_action: 'Plan de formation',
    },
  ],
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
      <Audits />
    </MemoryRouter>,
  )
}

describe('Page Audits (§9.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuditsApi.list.mockResolvedValue({ audits: [AUDIT] })
    mockAuditsApi.eligible.mockResolvedValue({
      auditors: [{ id: 'u2', role: 'internal_auditor', display_name: 'Alice' }],
      members: [],
    })
    mockAuditsApi.start.mockResolvedValue({})
    mockAuditsApi.verify.mockResolvedValue({})
    mockAuditsApi.respond.mockResolvedValue({})
    mockAuditsApi.addFinding.mockResolvedValue({})
    mockAuditsApi.create.mockResolvedValue({})
  })

  it('affiche le programme et ses constats', async () => {
    setPermissions(['internal_audit.respond'])
    renderPage()

    expect(await screen.findByText('Audit processus achats')).toBeInTheDocument()
    expect(screen.getByText(/critères : ISO 9001/)).toBeInTheDocument()
    expect(screen.getByText('Écart maîtrise des fournisseurs')).toBeInTheDocument()
  })

  it('un répondant simple ne voit ni planification ni vérification', async () => {
    setPermissions(['internal_audit.respond'], 'operator')
    renderPage()

    await screen.findByText('Audit processus achats')
    expect(screen.queryByText('Planifier un audit')).not.toBeInTheDocument()
    expect(screen.queryByText('Efficacité vérifiée')).not.toBeInTheDocument()
    expect(screen.queryByText('Inefficace — réouvrir')).not.toBeInTheDocument()
  })

  it('un auditeur peut ouvrir le formulaire de planification (auto-audit exclu)', async () => {
    setPermissions(['internal_audit.respond', 'internal_audit.manage'])
    renderPage()

    await screen.findByText('Audit processus achats')
    await userEvent.click(screen.getByText('Planifier un audit'))

    expect(screen.getByPlaceholderText('Titre *')).toBeInTheDocument()
    // Le sélecteur d'auditeur est explicitement distinct de l'utilisateur (§F.4)
    expect(screen.getByText(/Auditeur \(≠ vous/)).toBeInTheDocument()
  })

  it('le bouton Planifier reste désactivé tant que le formulaire est incomplet', async () => {
    setPermissions(['internal_audit.respond', 'internal_audit.manage'])
    renderPage()

    await screen.findByText('Audit processus achats')
    await userEvent.click(screen.getByText('Planifier un audit'))

    const planifier = screen.getByRole('button', { name: 'Planifier' })
    expect(planifier).toBeDisabled()

    await userEvent.type(screen.getByPlaceholderText('Titre *'), 'Audit 2027')
    expect(planifier).toBeDisabled() // scope, critères et auditeur manquent encore
  })

  it('un auditeur peut démarrer un audit planifié', async () => {
    setPermissions(['internal_audit.respond', 'internal_audit.manage'])
    mockAuditsApi.list.mockResolvedValue({ audits: [{ ...AUDIT, status: 'planned', findings: [] }] })
    renderPage()

    await screen.findByText('Audit processus achats')
    await userEvent.click(screen.getByRole('button', { name: /Démarrer/ }))
    await waitFor(() => expect(mockAuditsApi.start).toHaveBeenCalledWith('a1'))
  })

  it('l auditeur peut vérifier l efficacité d un constat répondu', async () => {
    setPermissions(['internal_audit.respond', 'internal_audit.manage'])
    renderPage()

    await screen.findByText('Écart maîtrise des fournisseurs')
    await userEvent.click(screen.getByRole('button', { name: /Efficacité vérifiée/ }))
    await waitFor(() =>
      expect(mockAuditsApi.verify).toHaveBeenCalledWith('f1', { effective: true, comment: 'Efficacité vérifiée' }),
    )
  })

  it('une inefficacité déclenche la réouverture du constat', async () => {
    setPermissions(['internal_audit.respond', 'internal_audit.manage'])
    renderPage()

    await screen.findByText('Écart maîtrise des fournisseurs')
    await userEvent.click(screen.getByRole('button', { name: /Inefficace — réouvrir/ }))
    await waitFor(() =>
      expect(mockAuditsApi.verify).toHaveBeenCalledWith('f1', { effective: false, comment: 'Inefficace — réouverture' }),
    )
  })

  it('affiche le message d erreur de l API (ex. auto-audit interdit)', async () => {
    setPermissions(['internal_audit.respond', 'internal_audit.manage'])
    mockAuditsApi.list.mockRejectedValue(new Error('auto-audit interdit (§F.4)'))
    renderPage()

    expect(await screen.findByText(/auto-audit interdit/)).toBeInTheDocument()
  })

  it('indique qu aucun audit n est planifié', async () => {
    setPermissions(['internal_audit.respond'])
    mockAuditsApi.list.mockResolvedValue({ audits: [] })
    renderPage()

    expect(await screen.findByText('Aucun audit planifié.')).toBeInTheDocument()
  })

  it('rappelle la règle de vérification par une personne distincte (§F.4)', async () => {
    setPermissions(['internal_audit.respond'])
    renderPage()

    await screen.findByText('Écart maîtrise des fournisseurs')
    expect(screen.getByText(/Vérification réservée à une personne distincte/)).toBeInTheDocument()
  })

  it('affiche le badge de statut du constat selon son état', async () => {
    setPermissions(['internal_audit.respond'])
    renderPage()

    await screen.findByText('Écart maîtrise des fournisseurs')
    const carte = screen.getByText('Écart maîtrise des fournisseurs').closest('div.bg-white') as HTMLElement
    expect(within(carte).getByText('Répondu')).toBeInTheDocument()
  })
})
