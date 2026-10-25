import React, { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, ClipboardList, Play, Plus, ShieldCheck } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { cn } from '@/lib/utils'
import { auditsApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

/** §9.2 Audits internes — auto-audit interdit, constats immuables,
 * vérification par personne distincte, clôture après résolution. */

const AUDIT_STATUS: Record<string, { label: string; badge: string }> = {
  planned: { label: 'Planifié', badge: 'bg-slate-100 text-slate-700' },
  in_progress: { label: 'En cours', badge: 'bg-amber-100 text-amber-800' },
  closed: { label: 'Clôturé', badge: 'bg-emerald-100 text-emerald-800' },
}

const FIND_STATUS: Record<string, { label: string; badge: string }> = {
  open: { label: 'Ouvert', badge: 'bg-rose-100 text-rose-700' },
  responded: { label: 'Répondu', badge: 'bg-amber-100 text-amber-800' },
  verified_effective: { label: 'Efficacité vérifiée', badge: 'bg-emerald-100 text-emerald-800' },
  reopened: { label: 'Réouvert', badge: 'bg-rose-100 text-rose-700' },
  closed: { label: 'Clôturé', badge: 'bg-slate-100 text-slate-600' },
}

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function Audits() {
  const { has } = usePermissions()
  const canManage = has('internal_audit.manage')
  const canRespond = has('internal_audit.respond')
  const meId = useAuthStore((st) => st.user?.id)
  /** Le constat se répond par son responsable de processus désigné (ou tout répondant s'il n'y en a pas). */
  const mayRespond = (f: { process_owner_id?: string | null }) => canRespond && (!f.process_owner_id || f.process_owner_id === meId)

  const [audits, setAudits] = useState<any[]>([])
  const [eligible, setEligible] = useState<{ auditors: any[]; members: any[] }>({ auditors: [], members: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', scope: '', criteria: '', auditor_id: '' })
  const [findingFor, setFindingFor] = useState<string | null>(null)
  const [finding, setFinding] = useState({ title: '', description: '', classification: 'minor', process_owner_id: '' })
  const [respondFor, setRespondFor] = useState<string | null>(null)
  const [respond, setRespond] = useState({ response: '', corrective_action: '' })
  const [closeFor, setCloseFor] = useState<string | null>(null)
  const [closeSummary, setCloseSummary] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await auditsApi.list()
      setAudits(res.audits ?? [])
      if (canManage) {
        const el = await auditsApi.eligible()
        setEligible(el)
      }
      setError('')
    } catch (e: any) {
      setError(e.message ?? 'chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [canManage])

  useEffect(() => {
    void load()
  }, [load])

  const flash = (m: string) => {
    setNotice(m)
    window.setTimeout(() => setNotice(''), 4000)
  }

  const run = async (id: string, fn: () => Promise<unknown>, msg: string) => {
    setBusyId(id)
    try {
      await fn()
      flash(msg)
      await load()
      return true
    } catch (e: any) {
      setError(e.message ?? 'opération impossible')
      return false
    } finally {
      setBusyId('')
    }
  }

  const submitCreate = async () => {
    try {
      await auditsApi.create(form)
      flash('Audit planifié (auditeur distinct exigé §F.4)')
      setShowCreate(false)
      setForm({ title: '', scope: '', criteria: '', auditor_id: '' })
      await load()
    } catch (e: any) {
      setError(e.message ?? 'création impossible')
    }
  }

  const submitFinding = async (auditId: string) => {
    try {
      await auditsApi.addFinding(auditId, { ...finding, process_owner_id: finding.process_owner_id || null })
      flash('Constat enregistré — le responsable est notifié')
      setFindingFor(null)
      setFinding({ title: '', description: '', classification: 'minor', process_owner_id: '' })
      await load()
    } catch (e: any) {
      setError(e.message ?? 'constat impossible')
    }
  }

  const submitRespond = async (findingId: string) => {
    try {
      await auditsApi.respond(findingId, respond)
      flash('Réponse enregistrée — le constat d origine est inchangé')
      setRespondFor(null)
      await load()
    } catch (e: any) {
      setError(e.message ?? 'réponse impossible')
    }
  }

  const submitVerify = async (findingId: string, effective: boolean) => {
    try {
      await auditsApi.verify(findingId, { effective, comment: effective ? 'Efficacité vérifiée' : 'Inefficace — réouverture' })
      flash(effective ? 'Efficacité vérifiée' : 'Constat réouvert')
      await load()
    } catch (e: any) {
      setError(e.message ?? 'vérification impossible')
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ClipboardList className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">Audits internes</h1>
            <p className="text-xs text-slate-500">
              Programme, constats, réponses et vérification d efficacité (§9.2) — auto-audit interdit (§F.4)
            </p>
          </div>
        </div>
        {canManage && !showCreate && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Planifier un audit
          </button>
        )}
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>}
      {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2">{notice}</div>}

      {showCreate && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-800">Planifier un audit</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Titre *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <select className={inputCls} value={form.auditor_id} onChange={(e) => setForm({ ...form, auditor_id: e.target.value })}>
              <option value="">Auditeur (≠ vous, §F.4) *</option>
              {eligible.auditors.map((a) => (
                <option key={a.id} value={a.id}>{a.display_name ?? a.email ?? a.id} — {a.role}</option>
              ))}
            </select>
            <textarea className={cn(inputCls, 'sm:col-span-2')} rows={2} placeholder="Périmètre / scope *" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} />
            <textarea className={cn(inputCls, 'sm:col-span-2')} rows={2} placeholder="Critères (référentiel, clauses) *" value={form.criteria} onChange={(e) => setForm({ ...form, criteria: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">Annuler</button>
            <button onClick={() => void submitCreate()} disabled={!form.title || !form.scope || !form.criteria || !form.auditor_id}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">Planifier</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-sm text-slate-500 py-10">Chargement…</div>
      ) : audits.length === 0 ? (
        <div className="text-center text-sm text-slate-500 py-10 bg-white rounded-xl border border-slate-200">Aucun audit planifié.</div>
      ) : (
        <div className="space-y-3">
          {audits.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800">{a.title}</p>
                  <p className="text-xs text-slate-500">{a.scope} · critères : {a.criteria}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('badge whitespace-nowrap', AUDIT_STATUS[a.status]?.badge)}>{AUDIT_STATUS[a.status]?.label}</span>
                  {canManage && a.status === 'planned' && (
                    <button onClick={() => void run(a.id, () => auditsApi.start(a.id), 'Audit démarré')} disabled={busyId === a.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-amber-50 text-amber-700 hover:bg-amber-100">
                      <Play className="w-3.5 h-3.5" /> Démarrer
                    </button>
                  )}
                  {canManage && a.status === 'in_progress' && (
                    <>
                      <button onClick={() => setFindingFor(findingFor === a.id ? null : a.id)} className="px-2.5 py-1 rounded-md text-xs bg-blue-50 text-blue-700 hover:bg-blue-100">+ Constat</button>
                      <button onClick={() => setCloseFor(closeFor === a.id ? null : a.id)} className="px-2.5 py-1 rounded-md text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Clôturer</button>
                    </>
                  )}
                </div>
              </div>

              {findingFor === a.id && (
                <div className="bg-slate-50 rounded-lg p-3 space-y-2 border border-slate-200">
                  <input className={inputCls} placeholder="Titre du constat *" value={finding.title} onChange={(e) => setFinding({ ...finding, title: e.target.value })} />
                  <textarea className={inputCls} rows={2} placeholder="Faits observés, éléments objectifs (immuable après création) *" value={finding.description} onChange={(e) => setFinding({ ...finding, description: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <select className={inputCls} value={finding.classification} onChange={(e) => setFinding({ ...finding, classification: e.target.value })}>
                      <option value="minor">Mineur</option>
                      <option value="major">Majeur</option>
                      <option value="observation">Observation</option>
                    </select>
                    <select className={inputCls} value={finding.process_owner_id} onChange={(e) => setFinding({ ...finding, process_owner_id: e.target.value })}>
                      <option value="">Responsable de processus (notifié)</option>
                      {eligible.members.map((m) => (
                        <option key={m.id} value={m.id}>{m.display_name ?? m.email ?? m.id}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setFindingFor(null)} className="px-2.5 py-1 text-xs rounded border border-slate-300 text-slate-600">Annuler</button>
                    <button onClick={() => void submitFinding(a.id)} disabled={!finding.title || !finding.description}
                      className="px-2.5 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-50">Enregistrer le constat</button>
                  </div>
                </div>
              )}
              {closeFor === a.id && (
                <div className="bg-emerald-50 rounded-lg p-3 space-y-2 border border-emerald-200">
                  <textarea className={inputCls} rows={2} placeholder="Synthèse de clôture (obligatoire) *" value={closeSummary} onChange={(e) => setCloseSummary(e.target.value)} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setCloseFor(null)} className="px-2.5 py-1 text-xs rounded border border-slate-300 text-slate-600">Annuler</button>
                    <button onClick={() => void run(a.id, async () => { await auditsApi.close(a.id, closeSummary); setCloseFor(null); setCloseSummary('') }, 'Audit clôturé')}
                      disabled={!closeSummary.trim()} className="px-2.5 py-1 text-xs rounded bg-emerald-600 text-white disabled:opacity-50">Clôturer</button>
                  </div>
                </div>
              )}

              {(a.findings ?? []).map((f: any) => (
                <div key={f.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {f.title} <span className={cn('badge ml-1', f.classification === 'major' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600')}>{f.classification}</span>
                      </p>
                      <p className="text-xs text-slate-500">{f.description}</p>
                    </div>
                    <span className={cn('badge whitespace-nowrap', FIND_STATUS[f.status]?.badge)}>{FIND_STATUS[f.status]?.label}</span>
                  </div>
                  {f.response && (
                    <p className="text-xs text-slate-600 bg-slate-50 rounded p-2 border border-slate-200">
                      <span className="font-semibold">Réponse process :</span> {f.response}
                      {f.corrective_action && <> · <span className="font-semibold">Action :</span> {f.corrective_action}</>}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {mayRespond(f) && ['open', 'responded', 'reopened'].includes(f.status) && (
                      respondFor === f.id ? (
                        <div className="w-full space-y-2 bg-amber-50 rounded p-2 border border-amber-200">
                          <textarea className={inputCls} rows={2} placeholder="Réponse factuelle (le constat d origine reste inchangé) *" value={respond.response} onChange={(e) => setRespond({ ...respond, response: e.target.value })} />
                          <input className={inputCls} placeholder="Action corrective proposée" value={respond.corrective_action} onChange={(e) => setRespond({ ...respond, corrective_action: e.target.value })} />
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setRespondFor(null)} className="px-2.5 py-1 text-xs rounded border border-slate-300 text-slate-600">Annuler</button>
                            <button onClick={() => void submitRespond(f.id)} disabled={!respond.response.trim()}
                              className="px-2.5 py-1 text-xs rounded bg-amber-600 text-white disabled:opacity-50">Envoyer la réponse</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setRespondFor(f.id)} className="px-2.5 py-1 text-xs rounded bg-amber-50 text-amber-700 hover:bg-amber-100">Répondre</button>
                      )
                    )}
                    {canManage && f.status === 'responded' && (
                      <>
                        <button onClick={() => void submitVerify(f.id, true)} className="px-2.5 py-1 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                          <CheckCircle2 className="w-3 h-3 inline mr-0.5" />Efficacité vérifiée
                        </button>
                        <button onClick={() => void submitVerify(f.id, false)} className="px-2.5 py-1 text-xs rounded bg-rose-50 text-rose-700 hover:bg-rose-100">Inefficace — réouvrir</button>
                      </>
                    )}
                    {canManage && f.status === 'reopened' && (
                      <button onClick={() => void submitVerify(f.id, true)} className="px-2.5 py-1 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Vérifier après nouvelle réponse</button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Vérification réservée à une personne distincte du répondant (§F.4)
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}



