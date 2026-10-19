import { useState } from 'react'
import { aiApi } from '@/lib/api'
import type { MicroStep } from '@/types'
import { errorMessage } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Sparkles, AlertTriangle } from 'lucide-react'

interface AIGuidancePanelProps {
  actionId: string
  stepId?: string
  onMicroStepSelect?: (ms: MicroStep) => void
}

export function AIGuidancePanel({ actionId, stepId, onMicroStepSelect }: AIGuidancePanelProps) {
  const [guidance, setGuidance] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchGuidance = async () => {
    setLoading(true)
    setError('')
    try {
      const g = await aiApi.guidance(actionId, stepId, {})
      setGuidance(g)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border border-indigo-100 bg-indigo-50/70 p-4 rounded-xl mb-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm font-semibold text-indigo-800 flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Guidage IA — décomposition
        </span>
        <Button size="sm" onClick={fetchGuidance} loading={loading} variant="outline">
          {guidance ? 'Régénérer' : 'Générer le guidage'}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-red-600 mb-2 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {guidance && guidance.microSteps && (
        <div className="space-y-2">
          <p className="text-xs text-indigo-700 mb-2">
            {guidance.microSteps.length} micro-étapes • confiance{' '}
            {Math.round((guidance.confidence ?? 1) * 100)}%
          </p>
          {guidance.microSteps.map((ms: MicroStep) => (
            <div
              key={ms.sub_step}
              className="p-3 bg-white rounded-lg border border-indigo-100 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/60 transition-colors"
              onClick={() => onMicroStepSelect?.(ms)}
            >
              <div className="flex justify-between text-xs">
                <span className="font-bold text-indigo-700">Micro-étape {ms.sub_step}</span>
                <span className="text-slate-400">{Math.round(ms.confidence * 100)}% de confiance</span>
              </div>
              <p className="text-sm text-slate-700 mt-1 leading-relaxed">{ms.guidance}</p>
              {ms.example && <p className="text-xs text-slate-500 italic mt-1">Ex : {ms.example}</p>}
              {ms.common_mistake && (
                <p className="text-xs text-amber-600 mt-1">⚠ Erreur fréquente : {ms.common_mistake}</p>
              )}
            </div>
          ))}
          {guidance.sources?.length > 0 && (
            <p className="text-xs text-slate-400 mt-2">Sources : {guidance.sources.join(', ')}</p>
          )}
          <p className="text-xs text-slate-400 mt-3">
            Statut brouillon — validation du responsable qualité requise avant application.
          </p>
        </div>
      )}

      {!guidance && !error && (
        <p className="text-sm text-slate-500">
          Générez un guidage IA pour décomposer cette étape en micro-actions terrain.
        </p>
      )}
    </div>
  )
}
