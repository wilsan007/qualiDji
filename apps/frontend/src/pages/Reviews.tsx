import React, { useCallback, useEffect, useState } from 'react'
import { CalendarCheck, Plus, X } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { cn } from '@/lib/utils'
import { reviewsApi } from '@/lib/api'

/** §9.3 Revues de direction — entrées consolidées (données enregistrées),
 * décisions et actions ; tenue impossible sans entrées ET décisions. */

const STATUS_FR: Record<string, string> = { assigned: 'assignées', in_progress: 'en cours', submitted: 'soumises', approved: 'approuvées', blocked: 'bloquées', closed: 'clôturées' }
const SEV_FR: Record<string, string> = { minor: 'mineures', major: 'majeures', critical: 'critiques' }
const CAPA_FR: Record<string, string> = { open: 'ouvertes', implemented: 'réalisées', verified: 'efficacité vérifiée', closed: 'clôturées', reopened: 'rouvertes' }

const dist = (o: Record<string, number> | undefined, names: Record<string, string>) =>
  o && Object.keys(o).length ? Object.entries(o).map(([k, n]) => `${n} ${names[k] ?? k}`).join(', ') : 'aucune'

/** Entrées consolidées lisibles (chiffres enregistrés ; le JSON brut reste la preuve scellée côté serveur). */
function InputsSummary({ inputs }: { inputs: any }) {
  // Forme inconnue (anciennes revues) : le contenu enregistré est montré tel quel
  if (!inputs.actions && !inputs.nc_capa) {
    return <pre className="text-[11px] text-slate-600 bg-slate-50 rounded p-2 overflow-x-auto">{JSON.stringify(inputs, null, 1)}</pre>
  }
  const rows: [string, string][] = [
    ['Actions', `${inputs.actions?.total ?? 0} au total — ${dist(inputs.actions?.by_status, STATUS_FR)} ; en retard : ${inputs.actions?.overdue_count ?? 0}`],
    ['Non-conformités', `${inputs.nc_capa?.total_nc ?? 0} au total, ${inputs.nc_capa?.open_nc ?? 0} ouverte(s) — gravité : ${dist(inputs.nc_capa?.by_severity, SEV_FR)}`],
    ['CAPA', `${inputs.nc_capa?.total_capa ?? 0} au total — ${dist(inputs.nc_capa?.capa_by_status, CAPA_FR)} ; en retard : ${inputs.nc_capa?.capa_overdue_count ?? 0} ; efficacité non conforme : ${inputs.nc_capa?.effectiveness_ineffective ?? 0}`],
    ['Audits internes', `${inputs.audits?.total ?? 0} au total, ${inputs.audits?.closed ?? 0} clôturé(s)`],
  ]
  return (
    <div className="bg-slate-50 rounded p-3 border border-slate-200">
      <dl className="space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-wrap gap-x-2 text-xs">
            <dt className="font-semibold text-slate-600 w-36 shrink-0">{k}</dt>
            <dd className="text-slate-700">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-slate-400 mt-2">
        Consolidé le {inputs.generated_at ? new Date(inputs.generated_at).toLocaleString('fr-FR') : '—'} par {inputs.generated_by ?? '—'} — {inputs.source ?? 'données enregistrées'}
      </p>
    </div>
  )
}

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function Reviews() {
  const { has } = usePermissions()
  const canManage = has('management_review.manage')

  const [reviews, setReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [decision, setDecision] = useState('')
  const [actionItem, setActionItem] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await reviewsApi.list()
      setReviews(res.reviews ?? [])
      setError('')
    } catch (e: any) {
      setError(e.message ?? 'chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const flash = (m: string) => {
    setNotice(m)
    window.setTimeout(() => setNotice(''), 4000)
  }

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn()
      flash(msg)
      await load()
      return true
    } catch (e: any) {
      setError(e.message ?? 'opération impossible')
      return false
    }
  }

  const current = reviews.find((r) => r.id === selected) ?? null
  const decisions: any[] = Array.isArray(current?.decisions) ? current.decisions : []
  const actions: any[] = Array.isArray(current?.actions) ? current.actions : []

  const addDecision = () => {
    if (!current || !decision.trim()) return
    void run(() => reviewsApi.update(current.id, { decisions: [...decisions, { decision: decision.trim() }] }), 'Décision ajoutée')
    setDecision('')
  }
  const addAction = () => {
    if (!current || !actionItem.trim()) return
    void run(() => reviewsApi.update(current.id, { actions: [...actions, { action: actionItem.trim() }] }), 'Action ajoutée')
    setActionItem('')
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CalendarCheck className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">Revues de direction</h1>
            <p className="text-xs text-slate-500">Entrées consolidées, décisions et actions (§9.3)</p>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <input className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Titre de la revue *" value={title} onChange={(e) => setTitle(e.target.value)} />
            <button onClick={() => void run(async () => { await reviewsApi.create({ title }); setTitle('') }, 'Revue créée (brouillon)')}
              disabled={title.trim().length < 3} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              <Plus className="w-4 h-4 inline mr-1" />Créer
            </button>
          </div>
        )}
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>}
      {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2">{notice}</div>}

      {loading ? (
        <div className="text-center text-sm text-slate-500 py-10">Chargement…</div>
      ) : reviews.length === 0 ? (
        <div className="text-center text-sm text-slate-500 py-10 bg-white rounded-xl border border-slate-200">Aucune revue de direction.</div>
      ) : (
        <div className="space-y-2">
          {reviews.map((r) => (
            <div key={r.id} className={cn('bg-white rounded-xl border p-4 cursor-pointer transition-colors', selected === r.id ? 'border-blue-300' : 'border-slate-200 hover:border-slate-300')}
              onClick={() => setSelected(selected === r.id ? null : r.id)}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800">{r.title}</p>
                  {r.held_at && <p className="text-[11px] text-slate-400">Tenue le {new Date(r.held_at).toLocaleDateString('fr-FR')}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('badge', r.status === 'held' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700')}>
                    {r.status === 'held' ? 'Tenue' : 'Brouillon'}
                  </span>
                  {canManage && r.status === 'draft' && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); void run(() => reviewsApi.prefill(r.id), 'Entrées consolidées depuis les rapports') }}
                        className="px-2.5 py-1 text-xs rounded bg-blue-50 text-blue-700 hover:bg-blue-100">Consolider les entrées</button>
                      <button onClick={(e) => { e.stopPropagation(); void run(() => reviewsApi.hold(r.id), 'Revue tenue') }}
                        className="px-2.5 py-1 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Marquer tenue</button>
                    </>
                  )}
                </div>
              </div>

              {selected === r.id && (
                <div className="mt-3 space-y-3 border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">Entrées consolidées (données enregistrées — aucun texte IA)</p>
                    {current?.inputs && Object.keys(current.inputs).length > 0 ? (
                      <InputsSummary inputs={current.inputs} />
                    ) : (
                      <p className="text-xs text-slate-400">Aucune entrée — cliquez sur « Consolider les entrées ».</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">Décisions</p>
                    <ul className="space-y-1 mb-2">
                      {decisions.map((d, i) => (
                        <li key={i} className="text-xs text-slate-700 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />{d.decision ?? d.title ?? JSON.stringify(d)}
                          {canManage && current?.status === 'draft' && (
                            <button onClick={() => void run(() => reviewsApi.update(current.id, { decisions: decisions.filter((_, j) => j !== i) }), 'Décision retirée')}
                              className="text-rose-400 hover:text-rose-600"><X className="w-3 h-3" /></button>
                          )}
                        </li>
                      ))}
                    </ul>
                    {canManage && current?.status === 'draft' && (
                      <div className="flex gap-2">
                        <input className={inputCls} placeholder="Nouvelle décision…" value={decision} onChange={(e) => setDecision(e.target.value)} />
                        <button onClick={addDecision} disabled={!decision.trim()} className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white disabled:opacity-50">+</button>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">Actions issues de la revue</p>
                    <ul className="space-y-1 mb-2">
                      {actions.map((a, i) => (
                        <li key={i} className="text-xs text-slate-700 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />{a.action ?? a.title ?? JSON.stringify(a)}
                          {canManage && current?.status === 'draft' && (
                            <button onClick={() => void run(() => reviewsApi.update(current.id, { actions: actions.filter((_, j) => j !== i) }), 'Action retirée')}
                              className="text-rose-400 hover:text-rose-600"><X className="w-3 h-3" /></button>
                          )}
                        </li>
                      ))}
                    </ul>
                    {canManage && current?.status === 'draft' && (
                      <div className="flex gap-2">
                        <input className={inputCls} placeholder="Nouvelle action avec responsable…" value={actionItem} onChange={(e) => setActionItem(e.target.value)} />
                        <button onClick={addAction} disabled={!actionItem.trim()} className="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white disabled:opacity-50">+</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


