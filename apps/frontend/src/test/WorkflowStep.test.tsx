import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

/**
 * Formulaire d'étape (C4) : garde-fou « justification obligatoire » aligné sur
 * le serveur, et étape d'approbation non saisissable par l'exécutant.
 * Les étapes sont celles du seed WF_CONTEXT_ANALYSIS (0001).
 */
import { WorkflowStep } from '@/components/WorkflowStep'
import { justificationRequired } from '@/lib/guardrails'
import type { WorkflowStep as WStep } from '@/types'

const CLIMATE: WStep = {
  id: 'ST_CTX_001_03',
  action_id: 'ACT_CTX_001',
  sequence: 3,
  title: 'Déterminer la pertinence du changement climatique',
  instruction: 'Déterminez si le changement climatique est un enjeu pertinent',
  step_type: 'choice',
  required: true,
  evidence_requirement: 'auto_save',
  ai_guidance_enabled: false,
  guardrails: [{ condition: "choice == 'non_pertinent'", action: 'require_justification', min_length: 100 }],
  choices: ['pertinent', 'non_pertinent', 'a_evaluer'],
  segregation_of_duties: false,
}

const APPROVAL: WStep = {
  ...CLIMATE,
  id: 'ST_CTX_001_04',
  sequence: 4,
  title: "Valider l'analyse",
  step_type: 'approval',
  guardrails: [],
  choices: undefined,
  approver_role: 'quality_manager',
  segregation_of_duties: true,
}

/** Hôte contrôlé : capture la dernière valeur remontée au parent. */
function Host({ step, onValue, onSubmit = () => {} }: { step: WStep; onValue: (v: any) => void; onSubmit?: () => void }) {
  const [value, setValue] = useState<any>(null)
  return (
    <WorkflowStep
      step={step}
      value={value}
      onChange={(v) => { setValue(v); onValue(v) }}
      onSubmit={onSubmit}
      submitting={false}
    />
  )
}

describe('justificationRequired — miroir de la grammaire serveur', () => {
  it('déclenche sur le choix visé avec la longueur du garde-fou', () => {
    expect(justificationRequired(CLIMATE, 'non_pertinent')).toBe(100)
    expect(justificationRequired(CLIMATE, 'pertinent')).toBeNull()
    expect(justificationRequired(CLIMATE, null)).toBeNull()
  })
  it("gère la condition '!=' et la longueur par défaut", () => {
    const s = { ...CLIMATE, guardrails: [{ condition: "choice != 'ok'", action: 'require_justification' }] }
    expect(justificationRequired(s, 'ko')).toBe(1)
    expect(justificationRequired(s, 'ok')).toBeNull()
  })
  it('ignore une condition illisible (le serveur échoue fermé, pas l\'interface)', () => {
    expect(justificationRequired({ ...CLIMATE, guardrails: [{ condition: 'x > 3', action: 'require_justification' }] }, 'a')).toBeNull()
  })
})

describe('WorkflowStep — choix avec garde-fou', () => {
  it('« pertinent » : soumission possible sans justification, valeur = chaîne', async () => {
    const onValue = vi.fn()
    render(<Host step={CLIMATE} onValue={onValue} />)
    await userEvent.click(screen.getByLabelText('pertinent'))
    expect(onValue).toHaveBeenLastCalledWith('pertinent')
    expect(screen.queryByLabelText(/Justification obligatoire/)).toBeNull()
    expect(screen.getByRole('button', { name: /Soumettre l'étape/ })).toBeEnabled()
  })

  it('« non_pertinent » : exige 100 caractères et remonte { choice, justification }', async () => {
    const onValue = vi.fn()
    render(<Host step={CLIMATE} onValue={onValue} />)
    await userEvent.click(screen.getByLabelText('non_pertinent'))
    const submit = screen.getByRole('button', { name: /Soumettre l'étape/ })
    expect(submit).toBeDisabled()

    const box = screen.getByLabelText(/Justification obligatoire \(au moins 100 caractères\)/)
    await userEvent.type(box, 'a'.repeat(99))
    expect(submit).toBeDisabled()
    await userEvent.type(box, 'a')
    expect(submit).toBeEnabled()
    expect(onValue).toHaveBeenLastCalledWith({ choice: 'non_pertinent', justification: 'a'.repeat(100) })
  })

  it('repasser sur un autre choix retire l\'exigence de justification', async () => {
    const onValue = vi.fn()
    render(<Host step={CLIMATE} onValue={onValue} />)
    await userEvent.click(screen.getByLabelText('non_pertinent'))
    await userEvent.click(screen.getByLabelText('a_evaluer'))
    expect(screen.queryByLabelText(/Justification obligatoire/)).toBeNull()
    expect(onValue).toHaveBeenLastCalledWith('a_evaluer')
  })
})

describe('WorkflowStep — étape d\'approbation', () => {
  it("n'offre aucun bouton de saisie à l'exécutant et nomme l'approbateur", () => {
    render(<Host step={APPROVAL} onValue={() => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/tranchée par quality_manager/)).toBeInTheDocument()
    expect(screen.getByText(/personne distincte de l'exécutant/)).toBeInTheDocument()
  })
})

describe('WorkflowStep — tous les types de l’éditeur sont exécutables', () => {
  const base: WStep = { ...CLIMATE, guardrails: [], choices: undefined, step_type: 'text_input' }

  it('nombre : champ numérique, valeur numérique, règle min/max appliquée avant soumission', async () => {
    const onValue = vi.fn()
    render(<Host step={{ ...base, step_type: 'number_input', validation_rule: 'max:8' }} onValue={onValue} />)
    const submit = screen.getByRole('button', { name: /Soumettre l'étape/ })
    expect(submit).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Valeur numérique'), '12')
    expect(submit).toBeDisabled()
    await userEvent.clear(screen.getByLabelText('Valeur numérique'))
    await userEvent.type(screen.getByLabelText('Valeur numérique'), '4.5')
    expect(submit).toBeEnabled()
    expect(onValue).toHaveBeenLastCalledWith(4.5)
  })

  it('confirmation obligatoire : « Je confirme » doit être cochée', async () => {
    const onValue = vi.fn()
    render(<Host step={{ ...base, step_type: 'confirmation' }} onValue={onValue} />)
    const submit = screen.getByRole('button', { name: /Soumettre l'étape/ })
    expect(submit).toBeDisabled()
    await userEvent.click(screen.getByLabelText('Je confirme'))
    expect(submit).toBeEnabled()
    expect(onValue).toHaveBeenLastCalledWith(true)
  })

  it('date : valeur AAAA-MM-JJ', async () => {
    const onValue = vi.fn()
    render(<Host step={{ ...base, step_type: 'date' }} onValue={onValue} />)
    await userEvent.type(screen.getByLabelText('Date'), '2026-11-02')
    expect(onValue).toHaveBeenLastCalledWith('2026-11-02')
  })

  it('code-barres : référence texte obligatoire', async () => {
    const onValue = vi.fn()
    render(<Host step={{ ...base, step_type: 'barcode' }} onValue={onValue} />)
    expect(screen.getByRole('button', { name: /Soumettre l'étape/ })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Code-barres lu'), '3760123456789')
    expect(screen.getByRole('button', { name: /Soumettre l'étape/ })).toBeEnabled()
    expect(onValue).toHaveBeenLastCalledWith('3760123456789')
  })

  it('instruction : « Marquer comme lue » soumet la valeur true sans saisie', async () => {
    const onSubmit = vi.fn()
    render(<Host step={{ ...base, step_type: 'instruction' }} onValue={() => {}} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Marquer comme lue' }))
    expect(onSubmit).toHaveBeenCalledWith(true)
  })

  it('lecture seule : aucun bouton de soumission, champs désactivés', () => {
    render(<WorkflowStep step={base} value="déjà saisi" onChange={() => {}} onSubmit={() => {}} submitting={false} readOnly done />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByText('Saisie enregistrée')).toBeInTheDocument()
  })
})
