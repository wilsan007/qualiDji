import { useState } from 'react'
import { stepsApi } from '@/lib/api'
import type { WorkflowStep } from '@/types'
import { Button } from '@/components/ui/Button'

interface WorkflowStepProps {
  step: WorkflowStep
  value?: any
  onChange: (value: any) => void
  onSubmit: () => void
  submitting: boolean
}

function stepTypeLabel(t: string): string {
  switch (t) {
    case 'text_input':
      return 'Saisie texte'
    case 'choice':
      return 'Choix'
    case 'approval':
      return 'Validation'
    case 'number':
      return 'Saisie numérique'
    case 'evidence':
      return 'Preuve à joindre'
    default:
      return t
  }
}

function ruleLabel(rule?: string): string | null {
  if (!rule) return null
  if (rule.startsWith('min_length:')) return `Au moins ${rule.split(':')[1]} caractères`
  if (rule.startsWith('max_length:')) return `Au plus ${rule.split(':')[1]} caractères`
  if (rule.startsWith('min:')) return `Minimum ${rule.split(':')[1]}`
  if (rule.startsWith('max:')) return `Maximum ${rule.split(':')[1]}`
  return rule
}

export function WorkflowStep({ step, value, onChange, onSubmit, submitting }: WorkflowStepProps) {
  const [localValue, setLocalValue] = useState<any>(value ?? null)

  const handleChange = (v: any) => {
    setLocalValue(v)
    onChange(v)
  }

  const isValid = () => {
    if (!step.required) return true
    if (localValue == null || localValue === '') return false
    if (step.validation_rule?.startsWith('min_length:')) {
      const n = Number(step.validation_rule.split(':')[1])
      return String(localValue).length >= n
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
          <span className="badge">{stepTypeLabel(step.step_type)}</span>
        </div>
      </div>

      <p className="text-sm text-slate-600 mb-1 leading-relaxed">{step.instruction}</p>
      {rule && <p className="text-xs text-slate-400 mb-2">Contrainte : {rule}</p>}

      {step.step_type === 'text_input' && (
        <textarea
          className="input min-h-[110px] mt-2"
          value={localValue ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Saisissez votre réponse…"
        />
      )}

      {step.step_type === 'choice' && step.choices && (
        <div className="mt-3 grid gap-2">
          {step.choices.map((c) => {
            const active = localValue === c
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
                  onChange={() => handleChange(c)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">{c}</span>
              </label>
            )
          })}
        </div>
      )}

      {step.step_type === 'approval' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onSubmit} disabled={submitting} loading={submitting}>
            Valider l'étape
          </Button>
          <Button variant="outline" onClick={() => handleChange('rejected')} disabled={submitting}>
            Rejeter
          </Button>
        </div>
      )}

      {(step.step_type === 'text_input' || step.step_type === 'choice') && (
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={onSubmit} disabled={!isValid() || submitting} loading={submitting}>
            Soumettre l'étape
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
