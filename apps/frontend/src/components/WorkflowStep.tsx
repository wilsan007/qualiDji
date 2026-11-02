import { useState } from 'react'
import type { WorkflowStep } from '@/types'
import { justificationRequired } from '@/lib/guardrails'
import { Button } from '@/components/ui/Button'

interface WorkflowStepProps {
  step: WorkflowStep
  value?: any
  onChange: (value: any) => void
  /** `value` : valeur à soumettre quand elle n'est pas encore remontée au parent (étape d'information). */
  onSubmit: (value?: any) => void
  submitting: boolean
  /** L'étape a déjà une saisie enregistrée. */
  done?: boolean
  /** Action non modifiable (soumise, approuvée…) ou lecteur : consultation seule. */
  readOnly?: boolean
}

function stepTypeLabel(t: string): string {
  switch (t) {
    case 'instruction':
      return 'Instruction'
    case 'text_input':
      return 'Saisie texte'
    case 'knowledge_question':
      return 'Question de connaissance'
    case 'choice':
      return 'Choix'
    case 'approval':
      return 'Validation'
    case 'number_input':
      return 'Saisie numérique'
    case 'sensor_value':
      return 'Valeur de capteur'
    case 'checkbox':
      return 'Case à cocher'
    case 'confirmation':
      return 'Confirmation'
    case 'date':
      return 'Date'
    case 'signature':
      return 'Signature'
    case 'photo':
      return 'Photo'
    case 'file_upload':
      return 'Fichier'
    case 'barcode':
      return 'Code-barres'
    case 'qr_scan':
      return 'QR code'
    case 'location_check':
      return 'Position'
    case 'evidence':
      return 'Preuve à joindre'
    default:
      return t
  }
}

/** Étapes dont la réponse est une référence texte (code lu, lieu, nom du signataire, description de la pièce jointe). */
const REFERENCE_STEPS: Record<string, { label: string; placeholder: string }> = {
  signature: { label: 'Nom du signataire', placeholder: 'Prénom Nom (vaut signature de l’étape)' },
  photo: { label: 'Description de la photo jointe', placeholder: 'Ce que montre la photo — la pièce se joint dans « Preuves »' },
  file_upload: { label: 'Description du fichier joint', placeholder: 'Nature du fichier — la pièce se joint dans « Preuves »' },
  barcode: { label: 'Code-barres lu', placeholder: 'Valeur du code-barres' },
  qr_scan: { label: 'Contenu du QR code', placeholder: 'Contenu lu sur le QR code' },
  location_check: { label: 'Lieu / position constatés', placeholder: 'Atelier, zone, rayonnage, coordonnées…' },
}

function ruleLabel(rule?: string): string | null {
  if (!rule) return null
  if (rule.startsWith('min_length:')) return `Au moins ${rule.split(':')[1]} caractères`
  if (rule.startsWith('max_length:')) return `Au plus ${rule.split(':')[1]} caractères`
  if (rule.startsWith('min:')) return `Minimum ${rule.split(':')[1]}`
  if (rule.startsWith('max:')) return `Maximum ${rule.split(':')[1]}`
  return rule
}

/**
 * Valeur d'une étape à choix : « choix » ou { choice, justification } quand un garde-fou l'exige.
 * (Miroir de la grammaire serveur : voir lib/guardrails.ts — justificationRequired.)
 */
function splitChoice(v: any): { choice: string | null; justification: string } {
  if (v && typeof v === 'object') return { choice: v.choice ?? null, justification: v.justification ?? '' }
  return { choice: typeof v === 'string' ? v : null, justification: '' }
}

export function WorkflowStep({ step, value, onChange, onSubmit, submitting, done = false, readOnly = false }: WorkflowStepProps) {
  const [localValue, setLocalValue] = useState<any>(value ?? null)

  const handleChange = (v: any) => {
    setLocalValue(v)
    onChange(v)
  }

  const { choice, justification } = splitChoice(localValue)
  const needJustification = step.step_type === 'choice' ? justificationRequired(step, choice) : null

  const pickChoice = (c: string) => {
    handleChange(justificationRequired(step, c) !== null ? { choice: c, justification } : c)
  }
  const editJustification = (j: string) => handleChange({ choice, justification: j })

  const isValid = () => {
    if (step.step_type === 'choice') {
      if (!choice) return !step.required
      if (needJustification !== null) return justification.trim().length >= needJustification
      return true
    }
    if (step.step_type === 'instruction') return true
    if (step.step_type === 'confirmation') return step.required ? localValue === true : typeof localValue === 'boolean'
    if (step.step_type === 'checkbox') return typeof localValue === 'boolean' || !step.required
    if (step.step_type === 'number_input' || step.step_type === 'sensor_value') {
      if (localValue == null || localValue === '') return !step.required
      const n = typeof localValue === 'number' ? localValue : Number(localValue)
      if (!Number.isFinite(n)) return false
      const min = step.validation_rule?.startsWith('min:') ? Number(step.validation_rule.split(':')[1]) : null
      const max = step.validation_rule?.startsWith('max:') ? Number(step.validation_rule.split(':')[1]) : null
      return (min === null || n >= min) && (max === null || n <= max)
    }
    if (!step.required) return true
    if (localValue == null || localValue === '') return false
    if (step.validation_rule?.startsWith('min_length:')) {
      const n = Number(step.validation_rule.split(':')[1])
      return String(localValue).trim().length >= n
    }
    return true
  }

  const rule = ruleLabel(step.validation_rule)
  const missing = step.required && !isValid()

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center shrink-0">
            {step.sequence}
          </span>
          <span className="font-semibold text-slate-900 truncate">{step.title}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {step.ai_guidance_enabled && (
            <span className="badge bg-indigo-50 text-indigo-600 border-indigo-100">IA</span>
          )}
          {done && <span className="badge bg-emerald-50 text-emerald-700 border-emerald-100">Saisie enregistrée</span>}
          <span className="badge">{stepTypeLabel(step.step_type)}</span>
        </div>
      </div>

      <p className="text-sm text-slate-600 mb-1 leading-relaxed">{step.instruction}</p>
      {rule && <p className="text-xs text-slate-400 mb-2">Contrainte : {rule}</p>}

      {(step.step_type === 'text_input' || step.step_type === 'knowledge_question') && (
        <textarea
          className="input min-h-[110px] mt-2"
          value={localValue ?? ''}
          disabled={readOnly}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Saisissez votre réponse…"
        />
      )}

      {(step.step_type === 'number_input' || step.step_type === 'sensor_value') && (
        <input
          className="input mt-2 max-w-xs"
          type="number"
          step="any"
          aria-label={step.step_type === 'sensor_value' ? 'Valeur mesurée' : 'Valeur numérique'}
          value={localValue ?? ''}
          disabled={readOnly}
          onChange={(e) => handleChange(e.target.value === '' ? null : Number(e.target.value))}
          placeholder={step.step_type === 'sensor_value' ? 'Valeur mesurée' : 'Saisissez un nombre'}
        />
      )}

      {step.step_type === 'date' && (
        <input
          className="input mt-2 max-w-xs"
          type="date"
          aria-label="Date"
          value={typeof localValue === 'string' ? localValue.slice(0, 10) : ''}
          disabled={readOnly}
          onChange={(e) => handleChange(e.target.value || null)}
        />
      )}

      {(step.step_type === 'checkbox' || step.step_type === 'confirmation') && (
        <label className="mt-3 flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
          <input
            type="checkbox"
            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
            checked={localValue === true}
            disabled={readOnly}
            onChange={(e) => handleChange(e.target.checked)}
          />
          <span className="text-sm text-slate-700">
            {step.step_type === 'confirmation' ? 'Je confirme' : 'Case cochée'}
          </span>
        </label>
      )}

      {REFERENCE_STEPS[step.step_type] && (
        <div className="mt-2">
          <label className="label" htmlFor={`ref-${step.id}`}>{REFERENCE_STEPS[step.step_type].label}</label>
          <input
            id={`ref-${step.id}`}
            className="input"
            value={typeof localValue === 'string' ? localValue : ''}
            disabled={readOnly}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={REFERENCE_STEPS[step.step_type].placeholder}
          />
        </div>
      )}

      {step.step_type === 'instruction' && (
        <p className="mt-2 text-xs text-slate-500">Étape d’information : lisez l’instruction, puis marquez-la comme lue.</p>
      )}

      {step.step_type === 'choice' && step.choices && (
        <div className="mt-3 grid gap-2">
          {step.choices.map((c) => {
            const active = choice === c
            return (
              <label
                key={c}
                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  active
                    ? 'border-blue-400 bg-blue-50/60 ring-1 ring-blue-300'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name={`step-${step.id}`}
                  checked={active}
                  disabled={readOnly}
                  onChange={() => pickChoice(c)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">{c}</span>
              </label>
            )
          })}
        </div>
      )}

      {step.step_type === 'choice' && needJustification !== null && (
        <div className="mt-3">
          <label className="label" htmlFor={`just-${step.id}`}>
            Justification obligatoire (au moins {needJustification} caractères)
          </label>
          <textarea
            id={`just-${step.id}`}
            className="input min-h-[90px]"
            value={justification}
            disabled={readOnly}
            onChange={(e) => editJustification(e.target.value)}
            placeholder="Expliquez pourquoi ce choix est retenu…"
          />
          <p className="text-xs text-slate-400 mt-1">{justification.trim().length} / {needJustification}</p>
        </div>
      )}

      {step.step_type === 'approval' && (
        <p className="mt-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
          Étape tranchée par {step.approver_role ?? 'l\'approbateur'} après la soumission de l'action
          {step.segregation_of_duties ? ' (personne distincte de l\'exécutant)' : ''}. Elle ne se saisit pas.
        </p>
      )}

      {step.step_type !== 'approval' && !readOnly && (
        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={() => {
              // Étape d'information : la valeur « lue » est posée au moment de la soumission
              if (step.step_type === 'instruction') {
                handleChange(true)
                onSubmit(true)
              } else {
                onSubmit()
              }
            }}
            disabled={!isValid() || submitting}
            loading={submitting}
          >
            {step.step_type === 'instruction' ? 'Marquer comme lue' : "Soumettre l'étape"}
          </Button>
          {missing && (
            <span className="text-xs text-amber-600">
              {step.required ? 'Réponse obligatoire avant soumission.' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
