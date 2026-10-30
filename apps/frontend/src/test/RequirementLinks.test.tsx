import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Carte exigences ↔ workflows de l'entreprise (panneau de la matrice) : liens effectifs, avertissement
 * non bloquant, motif obligatoire (L.5) pour ajouter, retirer, écarter ou rétablir.
 */
const { mockMatrixApi, mockWorkflowsApi } = vi.hoisted(() => ({
  mockMatrixApi: { addLink: vi.fn(), removeLink: vi.fn() },
  mockWorkflowsApi: { list: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ matrixApi: mockMatrixApi, workflowsApi: mockWorkflowsApi }))

import { RequirementLinks } from '@/components/RequirementLinks'
import type { MatrixRequirement, RequirementLink } from '@/types'

const NO_COVERAGE = 'Aucun workflow publié ni module ne couvre cette exigence (avertissement : ne change pas le statut de couverture).'

const suggestion: RequirementLink = {
  id: null, origin: 'suggestion', kind: 'workflow', target: 'WF_PROCESS_MAPPING', label: 'WF_PROCESS_MAPPING',
  coverage_type: 'primary', state: 'missing', reason: null, created_at: null,
}
const own: RequirementLink = {
  id: 'l-own', origin: 'tenant', kind: 'workflow', target: 'WF_SCOPE_DEFINITION', label: 'Périmètre du SMQ',
  coverage_type: 'supporting', state: 'published', reason: 'Notre processus de cadrage', created_at: '2026-10-29T08:00:00Z',
}
const moduleLink: RequirementLink = {
  id: 'l-mod', origin: 'tenant', kind: 'module', target: 'audits', label: 'Audits internes',
  coverage_type: 'primary', state: 'module', reason: 'Programme d’audit', created_at: '2026-10-29T08:00:00Z',
}

function makeLine(over: Partial<MatrixRequirement> = {}): MatrixRequirement {
  return {
    id: 'ISO9001-2026-4.4', clause: '4', title: 'Processus du SMQ', requirement_type: 'requirement', source_ref: '4.4',
    spaces: ['P'], workflow_codes: [], links: [], excluded_suggestions: [], warnings: [],
    tests: { positive: null, negative: null }, gap_status: 'ready_to_test', blocking: true, blocking_reasons: [],
    ...over,
  } as MatrixRequirement
}

beforeEach(() => {
  vi.clearAllMocks()
  mockWorkflowsApi.list.mockResolvedValue({
    workflows: [
      { id: 'WF_CONTEXT_ANALYSIS', name: 'Analyse du contexte' },
      { id: 'WF_SCOPE_DEFINITION_V2__ab12cd34', name: 'Périmètre du SMQ' },
    ],
  })
})

describe('RequirementLinks — affichage', () => {
  it('liste les liens avec leur état et leur origine', () => {
    render(<RequirementLinks line={makeLine({ links: [suggestion, own, moduleLink] })} canEdit onSaved={vi.fn()} />)
    expect(screen.getByText('Non défini')).toBeInTheDocument()
    expect(screen.getByText('Suggestion du catalogue')).toBeInTheDocument()
    expect(screen.getByText('Périmètre du SMQ')).toBeInTheDocument()
    expect(screen.getByText('Publié')).toBeInTheDocument()
    expect(screen.getByText('· Complémentaire')).toBeInTheDocument()
    expect(screen.getByText('Module')).toBeInTheDocument()
    expect(screen.getByText('Audits internes')).toBeInTheDocument()
    expect(screen.getByText(/Notre processus de cadrage/)).toBeInTheDocument()
  })

  it('affiche l’avertissement non bloquant et jamais le mot « bloquante »', () => {
    render(<RequirementLinks line={makeLine({ warnings: [NO_COVERAGE] })} canEdit onSaved={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(NO_COVERAGE)
    expect(screen.getByText('Aucun lien.')).toBeInTheDocument()
    expect(screen.queryByText(/bloquante/i)).not.toBeInTheDocument()
  })

  it('sans droit d’édition : aucun bouton ni formulaire', () => {
    render(<RequirementLinks line={makeLine({ links: [suggestion, own], excluded_suggestions: [{ id: 'x1', target: 'WF_OTHER', reason: 'inutile', created_at: '2026-10-29' }] })} canEdit={false} onSaved={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/Suggestion écartée/)).toBeInTheDocument()
  })
})

describe('RequirementLinks — modifications (motif obligatoire)', () => {
  it('retirer un lien de l’entreprise : refusé sans motif, puis appelé avec le motif', async () => {
    const user = userEvent.setup()
    const updated = makeLine({ links: [] })
    mockMatrixApi.removeLink.mockResolvedValue({ requirement: updated })
    const onSaved = vi.fn()
    render(<RequirementLinks line={makeLine({ links: [own] })} canEdit onSaved={onSaved} />)

    await user.click(screen.getByRole('button', { name: 'Retirer' }))
    await user.click(screen.getByRole('button', { name: 'Confirmer' }))
    expect(screen.getByText('Le motif est obligatoire (traçabilité L.5).')).toBeInTheDocument()
    expect(mockMatrixApi.removeLink).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Motif'), 'Processus abandonné')
    await user.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(mockMatrixApi.removeLink).toHaveBeenCalledWith('ISO9001-2026-4.4', 'l-own', 'Processus abandonné'))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated))
  })

  it('écarter une suggestion envoie un lien de type « exclusion »', async () => {
    const user = userEvent.setup()
    mockMatrixApi.addLink.mockResolvedValue({ requirement: makeLine() })
    render(<RequirementLinks line={makeLine({ links: [suggestion] })} canEdit onSaved={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Écarter' }))
    await user.type(screen.getByLabelText('Motif'), 'Non pertinent pour nous')
    await user.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() =>
      expect(mockMatrixApi.addLink).toHaveBeenCalledWith('ISO9001-2026-4.4', { kind: 'exclusion', workflow_family: 'WF_PROCESS_MAPPING', reason: 'Non pertinent pour nous' }),
    )
  })

  it('rétablir une suggestion écartée retire l’exclusion', async () => {
    const user = userEvent.setup()
    mockMatrixApi.removeLink.mockResolvedValue({ requirement: makeLine() })
    render(<RequirementLinks line={makeLine({ excluded_suggestions: [{ id: 'x1', target: 'WF_PROCESS_MAPPING', reason: 'inutile', created_at: '2026-10-29' }] })} canEdit onSaved={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Rétablir/ }))
    await user.type(screen.getByLabelText('Motif'), 'Finalement utile')
    await user.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(mockMatrixApi.removeLink).toHaveBeenCalledWith('ISO9001-2026-4.4', 'x1', 'Finalement utile'))
  })

  it('ajouter un workflow : propose les familles de la bibliothèque (sans doublon), exige cible et motif', async () => {
    const user = userEvent.setup()
    mockMatrixApi.addLink.mockResolvedValue({ requirement: makeLine({ links: [own] }) })
    render(<RequirementLinks line={makeLine({ links: [suggestion] })} canEdit onSaved={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Ajouter un lien' }))
    // La version « _V2__ab12cd34 » est ramenée à sa famille WF_SCOPE_DEFINITION
    expect(await screen.findByRole('option', { name: 'Périmètre du SMQ (WF_SCOPE_DEFINITION)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Analyse du contexte (WF_CONTEXT_ANALYSIS)' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ajouter le lien' }))
    expect(screen.getByText('Choisissez le workflow ou le module à lier.')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Cible'), 'WF_SCOPE_DEFINITION')
    await user.click(screen.getByRole('button', { name: 'Ajouter le lien' }))
    expect(screen.getByText('Le motif est obligatoire (traçabilité L.5).')).toBeInTheDocument()
    expect(mockMatrixApi.addLink).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Motif'), 'Notre processus de cadrage')
    await user.click(screen.getByRole('button', { name: 'Ajouter le lien' }))
    await waitFor(() =>
      expect(mockMatrixApi.addLink).toHaveBeenCalledWith('ISO9001-2026-4.4', {
        kind: 'workflow', workflow_family: 'WF_SCOPE_DEFINITION', coverage_type: 'primary', reason: 'Notre processus de cadrage',
      }),
    )
  })

  it('ajouter un module ; un module déjà lié n’est plus proposé', async () => {
    const user = userEvent.setup()
    mockMatrixApi.addLink.mockResolvedValue({ requirement: makeLine() })
    render(<RequirementLinks line={makeLine({ links: [moduleLink] })} canEdit onSaved={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Ajouter un lien' }))
    await user.selectOptions(screen.getByLabelText('Type de lien'), 'module')
    expect(screen.queryByRole('option', { name: 'Audits internes' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Cible'), 'reviews')
    await user.type(screen.getByLabelText('Motif'), 'Revue annuelle')
    await user.click(screen.getByRole('button', { name: 'Ajouter le lien' }))
    await waitFor(() =>
      expect(mockMatrixApi.addLink).toHaveBeenCalledWith('ISO9001-2026-4.4', { kind: 'module', module: 'reviews', coverage_type: 'primary', reason: 'Revue annuelle' }),
    )
  })

  it('une erreur du serveur est affichée et le formulaire reste ouvert', async () => {
    const user = userEvent.setup()
    mockMatrixApi.removeLink.mockRejectedValue(new Error('Lien introuvable ou déjà retiré.'))
    render(<RequirementLinks line={makeLine({ links: [own] })} canEdit onSaved={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Retirer' }))
    await user.type(screen.getByLabelText('Motif'), 'Nettoyage')
    await user.click(screen.getByRole('button', { name: 'Confirmer' }))
    expect(await screen.findByText('Lien introuvable ou déjà retiré.')).toBeInTheDocument()
    expect(screen.getByLabelText('Motif')).toBeInTheDocument()
  })
})
