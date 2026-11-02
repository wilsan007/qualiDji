import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { actionsApi } from '@/lib/api'
import { statusBadge, statusLabel, formatDate, errorMessage } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/States'
import { ClipboardList, Inbox } from 'lucide-react'
import type { Action } from '@/types'

/** Taille de page du serveur (GET /actions/assigned). */
const PAGE_SIZE = 50

const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Toutes' },
  { value: 'assigned', label: 'Assignées' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'submitted', label: 'Soumises' },
  { value: 'blocked', label: 'Bloquées' },
  { value: 'approved', label: 'Approuvées' },
]

/** Écran « Mes actions » : la liste complète (exécutant : les siennes ; gestionnaire ou auditeur : tout le tenant), filtrable par statut. */
export function ActionsList() {
  const navigate = useNavigate()
  const [actions, setActions] = useState<Action[]>([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [more, setMore] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    actionsApi
      .list(status ? { status } : undefined)
      .then((r: any) => {
        const rows: Action[] = r.actions ?? []
        setActions(rows)
        setMore(rows.length >= PAGE_SIZE)
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [status])

  /** Page suivante (le serveur renvoie les actions par pages de 50, les plus récentes d'abord). */
  const loadMore = () => {
    setLoading(true)
    actionsApi
      .list({ status: status || undefined, offset: actions.length })
      .then((r: any) => {
        const rows: Action[] = r.actions ?? []
        setActions((prev) => [...prev, ...rows])
        setMore(rows.length >= PAGE_SIZE)
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Mes actions</h1>
          <p className="page-subtitle">Toutes les actions qui vous concernent, à ouvrir pour les exécuter, les valider ou les consulter</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par statut">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                status === f.value ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && actions.length === 0 && !error && <PageLoader label="Chargement des actions…" />}

      {!error && !(loading && actions.length === 0) && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Actions</h2>
            <span className="text-xs text-slate-400">{actions.length} affichée(s)</span>
          </div>
          <div className="divide-y divide-slate-100">
            {actions.length === 0 ? (
              <EmptyState icon={Inbox} title="Aucune action" hint="Aucune action ne correspond à ce filtre." />
            ) : (
              actions.map((a) => (
                <div key={a.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                      <ClipboardList className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-slate-900 leading-tight truncate">{a.workflow_actions?.title || 'Action sans titre'}</h3>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {a.workflow_definitions?.name} — {a.workflow_definitions?.standard_clause}
                        {a.due_at ? ` • échéance ${formatDate(a.due_at)}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={statusBadge(a.status)}>{statusLabel(a.status)}</span>
                    <Button
                      size="sm"
                      variant={a.status === 'blocked' || a.status === 'submitted' ? 'outline' : 'default'}
                      onClick={() => navigate(`/workflow/${a.id}`)}
                    >
                      Ouvrir
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          {more && (
            <div className="px-6 py-3 border-t border-slate-100 text-center">
              <Button size="sm" variant="outline" loading={loading} onClick={loadMore}>Afficher les actions suivantes</Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
