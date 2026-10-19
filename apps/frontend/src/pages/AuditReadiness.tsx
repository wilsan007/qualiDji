import { useCallback, useEffect, useState } from 'react'
import { dashboardApi } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/States'
import { Activity, CheckCircle, Clock, FileText, RefreshCw, ShieldCheck } from 'lucide-react'

/** Traduction des actions du journal d'audit. */
const ACTION_LABELS: Record<string, string> = {
  'action.submit': "Action soumise à l'évaluateur",
  'action.approve': 'Action validée',
  'action.block': 'Action bloquée (exception)',
  'step.submit': 'Étape de terrain soumise',
  'evidence.upload': 'Preuve téléversée',
  'evidence.validated': 'Preuve contrôlée et validée',
  'nc.create': 'Non-conformité déclarée',
  'nc.capa': 'Plan CAPA enregistré',
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action
}

/** Bandeau couleur selon l'événement. */
function eventTone(action: string): string {
  if (action.includes('validated') || action.includes('approve')) return 'bg-emerald-100 text-emerald-600'
  if (action.includes('block') || action.includes('nc.create')) return 'bg-red-100 text-red-600'
  if (action.includes('submit') || action.includes('upload')) return 'bg-blue-100 text-blue-600'
  return 'bg-slate-100 text-slate-600'
}

export default function AuditReadiness() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    dashboardApi
      .auditReadiness()
      .then((r: any) => setEvents(r.events ?? []))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <PageLoader label="Chargement du journal d'audit…" />

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Prêt audit</h1>
          <p className="page-subtitle">
            Historique verrouillé des événements et chaîne de preuves pour votre audit ISO 9001
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
        >
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {!error && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Événements d'audit
                  </p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{events.length}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                  <Activity className="w-5 h-5" />
                </div>
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Preuves validées
                  </p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {events.filter((e) => e.action === 'evidence.validated').length}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <CheckCircle className="w-5 h-5" />
                </div>
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    En attente de contrôle
                  </p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {events.filter((e) => e.action === 'step.submit').length}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Journal d'audit</h2>
              <span className="text-xs text-slate-400">
                {events.length > 50 ? `50 derniers sur ${events.length}` : `${events.length} événement(s)`}
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {events.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  title="Aucun événement d'audit pour le moment"
                  hint="Chaque action, soumission d'étape et validation de preuve vient s'ajouter automatiquement ici : c'est la traçabilité que l'auditeur vous demandera."
                />
              ) : (
                events.slice(0, 50).map((e) => (
                  <div
                    key={e.id}
                    className="px-6 py-4 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${eventTone(e.action)}`}
                      >
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {actionLabel(e.action)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {e.entity} • {new Date(e.created_at).toLocaleString('fr-FR')}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-slate-400 shrink-0">
                      {new Date(e.created_at).toLocaleTimeString('fr-FR')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}