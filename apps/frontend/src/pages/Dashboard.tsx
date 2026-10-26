import { useCallback, useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { actionsApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { usePermissions } from '@/hooks/usePermissions'
import { statusBadge, statusLabel, roleLabel, errorMessage } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/States'
import { NewActionModal } from '@/components/AssignAction'
import type { Action } from '@/types'
import { ArrowRight, ClipboardList, CheckCircle2, Loader2, AlertTriangle, Inbox, Plus } from 'lucide-react'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  // Lancer une action = action.assign (QM, Admin, responsables de site/département, consultant)
  const { has } = usePermissions()
  const canAssign = has('action.assign')
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newOpen, setNewOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    actionsApi
      .list()
      .then((r: any) => setActions(r.actions ?? []))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const stats = [
    {
      label: 'Actions totales',
      value: actions.length,
      icon: ClipboardList,
      tone: 'bg-blue-100 text-blue-600',
    },
    {
      label: 'En cours',
      value: actions.filter((a) => a.status === 'assigned' || a.status === 'in_progress').length,
      icon: Loader2,
      tone: 'bg-amber-100 text-amber-600',
    },
    {
      label: 'Soumises / validées',
      value: actions.filter((a) => a.status === 'submitted' || a.status === 'approved').length,
      icon: CheckCircle2,
      tone: 'bg-emerald-100 text-emerald-600',
    },
    {
      label: 'Bloquées',
      value: actions.filter((a) => a.status === 'blocked').length,
      icon: AlertTriangle,
      tone: 'bg-red-100 text-red-600',
    },
  ]

  if (loading) return <PageLoader label="Chargement du tableau de bord…" />

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {canAssign && <NewActionModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={load} />}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Tableau de bord</h1>
          <p className="page-subtitle">
            Bonjour {user?.display_name || user?.email} — {roleLabel(user?.role)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAssign && (
            <Button variant="outline" onClick={() => setNewOpen(true)}>
              <Plus className="w-4 h-4" /> Nouvelle action
            </Button>
          )}
          <Link
            to="/workflow"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors shadow-sm"
          >
            Ouvrir mes actions <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {s.label}
                </p>
                <p className="text-2xl font-bold text-slate-900 mt-1.5">{s.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${s.tone}`}>
                <s.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {/* Liste des actions */}
      {!error && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Mes actions</h2>
            <span className="text-xs text-slate-400">{actions.length} au total</span>
          </div>
          <div className="divide-y divide-slate-100">
            {actions.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Aucune action assignée"
                hint="Les actions issues des workflows qualité (contexte, analyse, amélioration…) apparaîtront ici dès qu'elles vous seront attribuées."
              />
            ) : (
              actions.map((a) => (
                <div
                  key={a.id}
                  className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                      <ClipboardList className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-slate-900 leading-tight truncate">
                        {a.workflow_actions?.title || 'Action sans titre'}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {a.workflow_definitions?.name} — {a.workflow_definitions?.standard_clause}
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
        </div>
      )}
    </div>
  )
}
