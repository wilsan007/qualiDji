import { useState } from 'react'
import { aiApi } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Sparkles, AlertTriangle, ShieldAlert } from 'lucide-react'

interface AIGuidancePanelProps {
  actionId: string
  stepId?: string
  /** Pré-remplit le champ courant avec la suggestion cliquée (brouillon non approuvé). */
  onSuggestion?: (instruction: string) => void
}

const CONF_LABELS: Record<string, string> = { low: 'faible', medium: 'moyenne', high: 'élevée' }

/**
 * §7 Assistant IA — affiche le contrat §7.4 : suggestions TOUJOURS non
 * approuvées (validation humaine requise), warnings R1-R3, informations
 * manquantes, bannière mode dégradé R6.
 */
export function AIGuidancePanel({ actionId, stepId, onSuggestion }: AIGuidancePanelProps) {
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
          <Sparkles className="w-4 h-4" /> Guidage IA — étape existante uniquement
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

      {guidance && (
        <div className="space-y-2">
          {guidance.degraded && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 flex items-start gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Mode standard (IA indisponible ou réponse non conforme) — R6. Le formulaire habituel reste pleinement utilisable.
            </p>
          )}
          <p className="text-xs text-indigo-700">
            {guidance.guidance?.length ?? 0} suggestion(s) • confiance {CONF_LABELS[guidance.confidence_label] ?? guidance.confidence_label}
            {guidance.model ? ` • ${guidance.model}` : ''}
          </p>

          {(guidance.guidance ?? []).map((g: any, i: number) => (
            <div
              key={g.step_id ?? i}
              onClick={() => onSuggestion?.(g.instruction)}
              className={`p-3 bg-white rounded-lg border border-indigo-100 ${onSuggestion ? 'cursor-pointer hover:border-indigo-300' : ''}`}
              title={onSuggestion ? 'Cliquer pour pré-remplir le champ (brouillon modifiable)' : undefined}
            >
              <div className="flex justify-between text-xs">
                <span className="font-bold text-indigo-700">{i + 1}. {g.title}</span>
                {g.step_id && <span className="text-slate-400 font-mono">{g.step_id}</span>}
              </div>
              <p className="text-sm text-slate-700 mt-1 leading-relaxed">{g.instruction}</p>
              {g.example && <p className="text-xs text-slate-500 italic mt-1">Exemple : {g.example}</p>}
              {g.common_pitfall && (
                <p className="text-xs text-amber-600 mt-1">⚠ Point de vigilance : {g.common_pitfall}</p>
              )}
              {(g.source_refs ?? []).length > 0 && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Sources : {g.source_refs.map((s: any) => `${s.object_id}${s.version ? ` v${s.version}` : ''}`).join(', ')}
                </p>
              )}
            </div>
          ))}

          {(guidance.missing_information ?? []).length > 0 && (
            <div className="text-xs text-slate-600 bg-white rounded-lg border border-slate-200 p-2.5">
              <span className="font-semibold">À confirmer par le responsable :</span>
              <ul className="list-disc list-inside mt-1">
                {guidance.missing_information.map((m: string, i: number) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
          {(guidance.warnings ?? []).length > 0 && (
            <ul className="text-xs text-amber-700 list-disc list-inside">
              {guidance.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
            </ul>
          )}

          <p className="text-xs text-slate-500 mt-2 border-t border-indigo-100 pt-2">
            Suggestions non approuvées — le contenu devient procédure uniquement après revue humaine (R4) ;
            l’IA ne décide, n’exécute et n’approuve rien (R10).
          </p>
        </div>
      )}

      {!guidance && !error && (
        <p className="text-sm text-slate-500">
          Générez un guidage pour décomposer cette étape existante — jamais pour en créer de nouvelle.
        </p>
      )}
    </div>
  )
}

