import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { webcrypto } from 'node:crypto'

/**
 * Preuves (C3) : le fichier part réellement au serveur avec son empreinte
 * SHA-256, la liste affiche les preuves de l'étape, le téléchargement passe par
 * une URL signée et l'intégrité se vérifie à la demande.
 */
const { mockEvidence } = vi.hoisted(() => ({
  mockEvidence: { list: vi.fn(), upload: vi.fn(), download: vi.fn(), verify: vi.fn() },
}))
vi.mock('@/lib/api', () => ({ evidenceApi: mockEvidence }))

import { EvidenceUploader } from '@/components/EvidenceUploader'

const EXISTING = {
  id: 'e1', action_id: 'a1', step_id: 'S1', kind: 'file', checksum: 'abcdef0123456789',
  value: { filename: 'releve.pdf', size: 2048, mime: 'application/pdf' }, captured_by: 'u1', captured_at: '2026-10-23T10:00:00Z',
}
const OTHER_STEP = { ...EXISTING, id: 'e2', step_id: 'S2', value: { filename: 'autre.pdf', size: 10, mime: 'application/pdf' } }

function pdf(name = 'rapport.pdf') {
  const f = new File(['%PDF-1.7 contenu'], name, { type: 'application/pdf' })
  // jsdom ne fournit pas toujours Blob.arrayBuffer
  if (!f.arrayBuffer) (f as any).arrayBuffer = async () => new TextEncoder().encode('%PDF-1.7 contenu').buffer
  return f
}

describe('EvidenceUploader', () => {
  beforeEach(() => {
    Object.values(mockEvidence).forEach((m) => m.mockReset())
    mockEvidence.list.mockResolvedValue({ evidence: [EXISTING, OTHER_STEP] })
    if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto)
  })

  it("liste uniquement les preuves de l'étape courante", async () => {
    render(<EvidenceUploader actionId="a1" stepId="S1" />)
    expect(await screen.findByText(/releve\.pdf/)).toBeInTheDocument()
    expect(screen.queryByText(/autre\.pdf/)).toBeNull()
    expect(mockEvidence.list).toHaveBeenCalledWith('a1')
  })

  it("envoie le fichier réel au serveur avec son SHA-256 (64 hex), puis recharge la liste", async () => {
    mockEvidence.upload.mockResolvedValue({ evidence: EXISTING })
    render(<EvidenceUploader actionId="a1" stepId="S1" />)
    await screen.findByText(/releve\.pdf/)
    const file = pdf()
    await userEvent.upload(document.querySelector('input[type=file]') as HTMLInputElement, file)
    await userEvent.click(screen.getByRole('button', { name: /Joindre 1 preuve/ }))

    await waitFor(() => expect(mockEvidence.upload).toHaveBeenCalledTimes(1))
    const [actionId, stepId, sent, checksum] = mockEvidence.upload.mock.calls[0]
    expect([actionId, stepId]).toEqual(['a1', 'S1'])
    expect(sent).toBe(file) // le fichier lui-même, pas des métadonnées fabriquées
    expect(checksum).toMatch(/^[0-9a-f]{64}$/)
    await waitFor(() => expect(mockEvidence.list).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/stockée\(s\)/)).toBeInTheDocument()
  })

  it('affiche le refus du serveur (type non autorisé, empreinte altérée…)', async () => {
    mockEvidence.upload.mockRejectedValue(new Error('type non autorisé : text/html'))
    render(<EvidenceUploader actionId="a1" stepId="S1" />)
    await userEvent.upload(document.querySelector('input[type=file]') as HTMLInputElement, pdf('x.html'))
    await userEvent.click(screen.getByRole('button', { name: /Joindre 1 preuve/ }))
    expect(await screen.findByText('type non autorisé : text/html')).toBeInTheDocument()
  })

  it('télécharge via URL signée (nouvel onglet) et affiche le résultat de vérification', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    mockEvidence.download.mockResolvedValue({ url: 'http://storage/signed?token=t', expires_in: 300, filename: 'releve.pdf', checksum: 'abcdef' })
    mockEvidence.verify.mockResolvedValueOnce({ intact: true, reason: null, expected: 'x', actual: 'x' })
    render(<EvidenceUploader actionId="a1" stepId="S1" />)
    await screen.findByText(/releve\.pdf/)

    await userEvent.click(screen.getByRole('button', { name: /Télécharger/ }))
    expect(open).toHaveBeenCalledWith('http://storage/signed?token=t', '_blank', 'noopener')

    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }))
    expect(await screen.findByText(/intègre/)).toBeInTheDocument()
  })

  it("signale une preuve ALTÉRÉE quand le recalcul d'empreinte diffère", async () => {
    mockEvidence.verify.mockResolvedValueOnce({ intact: false, reason: 'checksum_mismatch', expected: 'a', actual: 'b' })
    render(<EvidenceUploader actionId="a1" stepId="S1" />)
    await screen.findByText(/releve\.pdf/)
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }))
    expect(await screen.findByText(/ALTÉRÉ/)).toBeInTheDocument()
  })
})
