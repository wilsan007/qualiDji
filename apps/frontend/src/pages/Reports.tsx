import React, { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, Download, FileBarChart2, RefreshCw, ShieldCheck } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { cn } from '@/lib/utils'
import { reportsApi, ReportsFilters } from '@/lib/api'

/** Module H — Rapports et préparation d'audit (V5 §5.8).
 * Lecture : action.approve ; exports CSV et paquet d'audit : audit.export.
 * Les rapports distinguent données enregistrées et agrégats calculés (§5.8). */

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Assignée',
  in_progress: 'En cours',
  submitted: 'Soumise',
  approved: 'Approuvée',
  blocked: 'Bloquée',
  closed: 'Clôturée',
}

const SEVERITY_LABELS: Record<string, string> = {
  minor: 'Mineure',
  major: 'Majeure',
  critical: 'Critique',
}

const inputCls =
  'border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-3.5 py-2.5">
      <p className={cn('text-lg font-bold', tone ?? 'text-slate-800')}>{value}</p>
      <p className="text-[11px] text-slate-500 leading-tight">{label}</p>
    </div>
  )
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function Reports() {
  const { has } = usePermissions()
  const canExport = has('audit.export')

  const [filters, setFilters] = useState<ReportsFilters>({})
  const [actionsRep, setActionsRep] = useState<any>(null)
  const [ncRep, setNcRep] = useState<any>(null)
  const [pack, setPack] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [packLoading, setPackLoading] = useState(false)
  const [exporting, setExporting] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, n] = await Promise.all([reportsApi.actions(filters), reportsApi.ncCapa()])
      setActionsRep(a)
      setNcRep(n)
      setError('')
    } catch (e: any) {
      setError(e.message ?? 'chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    void load()
  }, [load])

  const loadPack = async () => {
    setPackLoading(true)
    try {
      setPack(await reportsApi.auditPack())
      setError('')
    } catch (e: any) {
      setError(e.message ?? 'paquet d’audit indisponible')
    } finally {
      setPackLoading(false)
    }
  }

  const doExport = async (which: 'actions' | 'nc') => {
    setExporting(which)
    try {
      if (which === 'actions') await reportsApi.exportActions(filters)
      else await reportsApi.exportNcCapa()
    } catch (e: any) {
      setError(e.message ?? 'export impossible')
    } finally {
      setExporting('')
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <FileBarChart2 className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">Rapports & préparation d’audit</h1>
            <p className="text-xs text-slate-500">
              Données enregistrées et agrégats calculés côté serveur — aucun texte généré par IA (§5.8)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <>
              <button
                onClick={() => void doExport('actions')}
                disabled={exporting !== ''}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {exporting === 'actions' ? 'Export…' : 'CSV actions'}
              </button>
              <button
                onClick={() => void doExport('nc')}
                disabled={exporting !== ''}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {exporting === 'nc' ? 'Export…' : 'CSV NC/CAPA'}
              </button>
              <button
                onClick={() => void loadPack()}
                disabled={packLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {packLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Paquet d’audit
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>}

      {/* Filtres du rapport d'actions */}
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-slate-200 p-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Statut</label>
          <select className={inputCls} value={filters.status ?? ''}
            onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}>
            <option value="">Tous</option>
            {Object.entries(STATUS_LABELS).map(([code, lbl]) => (
              <option key={code} value={code}>{lbl}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Créé après</label>
          <input type="date" className={inputCls} value={filters.from ?? ''}
            onChange={(e) => setFilters({ ...filters, from: e.target.value || undefined })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Créé avant</label>
          <input type="date" className={inputCls} value={filters.to ?? ''}
            onChange={(e) => setFilters({ ...filters, to: e.target.value || undefined })} />
        </div>
        {(filters.status || filters.from || filters.to) && (
          <button onClick={() => setFilters({})} className="text-xs text-blue-600 hover:text-blue-800 font-medium pb-1.5">
            Réinitialiser
          </button>
        )}
      </div>

      {/* Section actions */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800">
          <ClipboardCheck className="w-4 h-4 text-blue-600" /> Rapport d’actions
        </h2>
        {loading && !actionsRep ? (
          <div className="text-sm text-slate-500 py-6">Chargement…</div>
        ) : actionsRep && (
          <>
            <div className="flex flex-wrap gap-2">
              <Stat label="Total (données enregistrées)" value={actionsRep.recorded.total} />
              {Object.entries(actionsRep.computed.by_status as Record<string, number>).map(([st, n]) => (
                <Stat key={st} label={STATUS_LABELS[st] ?? st} value={n as number} tone="text-slate-700" />
              ))}
              <Stat label="En retard (calculé)" value={actionsRep.computed.overdue_count} tone="text-rose-600" />
            </div>
            {actionsRep.rows.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
                      <th className="px-4 py-2.5 font-medium">Workflow</th>
                      <th className="px-4 py-2.5 font-medium">Titre</th>
                      <th className="px-4 py-2.5 font-medium">Responsable</th>
                      <th className="px-4 py-2.5 font-medium">Statut</th>
                      <th className="px-4 py-2.5 font-medium">Échéance</th>
                      <th className="px-4 py-2.5 font-medium">Ancienneté</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {actionsRep.rows.slice(0, 50).map((r: any) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-600">{r.workflow}{r.clause ? ` (${r.clause})` : ''}</td>
                        <td className="px-4 py-2 font-medium text-slate-800">{r.title}</td>
                        <td className="px-4 py-2 text-slate-600">{r.responsible ?? '—'}</td>
                        <td className="px-4 py-2">
                          <span className={cn('badge', r.status === 'blocked' ? 'bg-rose-100 text-rose-700' : r.status === 'submitted' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600')}>
                            {STATUS_LABELS[r.status] ?? r.status}
                          </span>
                          {r.overdue && <span className="badge bg-rose-50 text-rose-600 ml-1">retard</span>}
                        </td>
                        <td className="px-4 py-2 text-slate-500">{fmt(r.due_at)}</td>
                        <td className="px-4 py-2 text-slate-500">{r.age_days ?? '—'} j</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {/* Section NC + CAPA */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800">
          <ShieldCheck className="w-4 h-4 text-rose-600" /> Registre NC & CAPA
        </h2>
        {ncRep && (
          <div className="flex flex-wrap gap-2">
            <Stat label="NC au total (enregistrées)" value={ncRep.recorded.total_nc} />
            <Stat label="NC ouvertes (calculé)" value={ncRep.computed.open_nc} tone="text-rose-600" />
            {Object.entries(ncRep.computed.by_severity as Record<string, number>).map(([sv, n]) => (
              <Stat key={sv} label={SEVERITY_LABELS[sv] ?? sv} value={n as number} tone="text-slate-700" />
            ))}
            <Stat label="CAPA en retard (calculé)" value={ncRep.computed.capa_overdue_count} tone="text-rose-600" />
            <Stat label="Efficacité non conforme" value={ncRep.computed.effectiveness_ineffective} tone="text-amber-600" />
          </div>
        )}
        {ncRep && ncRep.rows.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
                  <th className="px-4 py-2.5 font-medium">NC</th>
                  <th className="px-4 py-2.5 font-medium">Gravité</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                  <th className="px-4 py-2.5 font-medium">Ancienneté</th>
                  <th className="px-4 py-2.5 font-medium">CAPA — échéance</th>
                  <th className="px-4 py-2.5 font-medium">Efficacité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ncRep.rows.slice(0, 50).map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">{r.title}</td>
                    <td className="px-4 py-2">
                      <span className={cn('badge', r.severity === 'critical' ? 'bg-rose-100 text-rose-700' : r.severity === 'major' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600')}>
                        {SEVERITY_LABELS[r.severity] ?? r.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{r.status}</td>
                    <td className="px-4 py-2 text-slate-500">{r.age_days ?? '—'} j</td>
                    <td className="px-4 py-2 text-slate-500">
                      {r.capa_due_date ? fmt(r.capa_due_date) : '—'}
                      {r.capa_overdue && <span className="badge bg-rose-50 text-rose-600 ml-1">retard</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{r.effectiveness ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Paquet d'audit (§5.8 : programme, périmètre, constats, traces) */}
      {pack && (
        <section className="bg-white rounded-xl border border-blue-200 p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-slate-800">Paquet d’audit</h2>
            <p className="text-xs text-slate-500">
              Extrait le {new Date(pack.meta.exported_at).toLocaleString('fr-FR')} par {pack.meta.exported_by} — filtres : {pack.meta.filters}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Stat label="Workflows publiés" value={`${pack.recorded.workflows.published}/${pack.recorded.workflows.total}`} />
            <Stat label="Exigences évaluées" value={`${pack.recorded.requirements.assessed}/${pack.recorded.requirements.total}`} />
            <Stat label="Taux d’évaluation (%)" value={pack.computed.requirements_assessment_rate ?? '—'} tone="text-blue-700" />
            <Stat label="Actions" value={pack.recorded.actions_total} />
            <Stat label="NC" value={pack.recorded.nc_total} />
            <Stat label="CAPA" value={pack.recorded.capa_total} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-1.5">Derniers événements journalisés (données enregistrées)</p>
            <ul className="space-y-0.5 max-h-48 overflow-y-auto">
              {(pack.last_events ?? []).map((e: any, i: number) => (
                <li key={i} className="text-xs text-slate-600 flex gap-2">
                  <span className="text-slate-400 shrink-0">{new Date(e.created_at).toLocaleString('fr-FR')}</span>
                  <span className="font-medium">{e.action}</span>
                  <span className="text-slate-400">{e.entity}</span>
                  <span className="text-slate-400 ml-auto">{e.actor ?? ''}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {loading && actionsRep === null && !error && (
        <div className="text-sm text-slate-400 text-center">Chargement des rapports…</div>
      )}
    </div>
  )
}



