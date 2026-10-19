import React, { useCallback, useEffect, useState } from 'react'
import { Ban, CheckCircle2, ChevronDown, ChevronRight, History, UserPlus, Users2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usersApi, TenantUser } from '@/lib/api'

/** §3.4 Gestion des utilisateurs — accès réservé aux détenteurs de user.manage
 * (tenant_admin / super_admin / technical_admin). */

const ROLE_LABELS: Record<string, string> = {
  tenant_admin: 'Admin tenant',
  quality_manager: 'Responsable qualité',
  site_manager: 'Responsable site',
  department_manager: 'Responsable département',
  process_owner: 'Propriétaire de processus',
  operator: 'Opérateur',
  internal_auditor: 'Auditeur interne',
  external_auditor: 'Auditeur externe',
  consultant: 'Consultant',
  reader: 'Lecteur',
}

const inputCls =
  'w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelCls = 'block text-xs font-medium text-slate-600 mb-1'

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

type RoleHistoryEntry = { old_role: string | null; new_role: string; reason: string | null; created_at: string }

export default function Users() {
  const [users, setUsers] = useState<TenantUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [invite, setInvite] = useState({ email: '', role: 'operator', display_name: '' })
  const [savingInvite, setSavingInvite] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [history, setHistory] = useState<Record<string, RoleHistoryEntry[]>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await usersApi.list()
      setUsers(res.users ?? [])
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

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 4000)
  }

  const run = async (id: string, fn: () => Promise<unknown>, msg: string) => {
    setBusyId(id)
    try {
      await fn()
      flash(msg)
      await load()
    } catch (e: any) {
      setError(e.message ?? 'opération impossible')
    } finally {
      setBusyId('')
    }
  }

  const submitInvite = async () => {
    setSavingInvite(true)
    try {
      await usersApi.invite({
        email: invite.email,
        role: invite.role,
        display_name: invite.display_name || undefined,
      })
      flash(`Invitation envoyée à ${invite.email}`)
      setInvite({ email: '', role: 'operator', display_name: '' })
      setShowInvite(false)
      await load()
    } catch (e: any) {
      setError(e.message ?? 'invitation impossible')
    } finally {
      setSavingInvite(false)
    }
  }

  const toggleHistory = async (u: TenantUser) => {
    if (expanded === u.id) {
      setExpanded(null)
      return
    }
    try {
      const res = await usersApi.get(u.id)
      setHistory((h) => ({ ...h, [u.id]: res.role_history ?? [] }))
      setExpanded(u.id)
    } catch (e: any) {
      setError(e.message ?? 'historique indisponible')
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Users2 className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">Utilisateurs du tenant</h1>
            <p className="text-xs text-slate-500">
              Invitation, rôles, suspension et historique (§3.4) — user.manage requis
            </p>
          </div>
        </div>
        {!showInvite && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <UserPlus className="w-4 h-4" /> Inviter
          </button>
        )}
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>}
      {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2">{notice}</div>}

      {showInvite && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-800">Inviter un utilisateur</h2>
          <p className="text-xs text-slate-500">
            Le lien d'invitation GoTrue est à usage unique et expire — aucun mot de passe n'est transmis.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>E-mail *</label>
              <input className={inputCls} type="email" value={invite.email}
                onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                placeholder="prenom.nom@entreprise.fr" />
            </div>
            <div>
              <label className={labelCls}>Rôle *</label>
              <select className={inputCls} value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                {Object.entries(ROLE_LABELS).map(([code, lbl]) => (
                  <option key={code} value={code}>{lbl}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Nom affiché</label>
              <input className={inputCls} value={invite.display_name}
                onChange={(e) => setInvite({ ...invite, display_name: e.target.value })}
                placeholder="Prénom Nom" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowInvite(false)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
              Annuler
            </button>
            <button
              onClick={() => void submitInvite()}
              disabled={savingInvite || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(invite.email)}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingInvite ? 'Envoi…' : 'Envoyer l’invitation'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-sm text-slate-500 py-10">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
                <th className="px-4 py-2.5 font-medium">E-mail</th>
                <th className="px-4 py-2.5 font-medium">Nom</th>
                <th className="px-4 py-2.5 font-medium">Rôle</th>
                <th className="px-4 py-2.5 font-medium">Statut</th>
                <th className="px-4 py-2.5 font-medium">Dernière connexion</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <React.Fragment key={u.id}>
                  <tr className={cn('hover:bg-slate-50', expanded === u.id && 'bg-slate-50/60')}>
                    <td className="px-4 py-2.5">
                      <button onClick={() => void toggleHistory(u)} className="flex items-center gap-1.5 text-slate-700 hover:text-blue-600">
                        {expanded === u.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        {u.email ?? u.id.slice(0, 8)}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{u.display_name ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <select
                        className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white"
                        value={u.role}
                        disabled={busyId === u.id}
                        onChange={(e) => void run(u.id, () => usersApi.update(u.id, { role: e.target.value }), `Rôle mis à jour : ${ROLE_LABELS[e.target.value] ?? e.target.value}`)}
                      >
                        {Object.entries(ROLE_LABELS).map(([code, lbl]) => (
                          <option key={code} value={code}>{lbl}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      {u.is_active ? (
                        <span className="badge bg-emerald-100 text-emerald-800">Actif</span>
                      ) : (
                        <span className="badge bg-rose-100 text-rose-800">Suspendu</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{fmtDate(u.last_sign_in_at)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {u.is_active ? (
                        <button
                          onClick={() => void run(u.id, () => usersApi.deactivate(u.id), 'Utilisateur suspendu (sessions révoquées)')}
                          disabled={busyId === u.id}
                          title="Suspendre (révoque les sessions)"
                          className="p-1.5 rounded-md hover:bg-rose-50 disabled:opacity-40"
                        >
                          <Ban className="w-4 h-4 text-rose-500" />
                        </button>
                      ) : (
                        <button
                          onClick={() => void run(u.id, () => usersApi.activate(u.id), 'Utilisateur réactivé')}
                          disabled={busyId === u.id}
                          title="Réactiver"
                          className="p-1.5 rounded-md hover:bg-emerald-50 disabled:opacity-40"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === u.id && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={6} className="px-6 py-3 border-t border-slate-100">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-2">
                          <History className="w-3.5 h-3.5" /> Historique des rôles
                        </p>
                        {(history[u.id] ?? []).length === 0 ? (
                          <p className="text-xs text-slate-400">Aucun changement de rôle enregistré.</p>
                        ) : (
                          <ul className="space-y-1">
                            {(history[u.id] ?? []).map((h, i) => (
                              <li key={i} className="text-xs text-slate-600">
                                <span className="text-slate-400">{fmtDate(h.created_at)}</span>
                                {' · '}
                                <span className="line-through text-slate-400">{h.old_role ?? '—'}</span>
                                {' → '}
                                <span className="font-medium">{h.new_role}</span>
                                {h.reason && <span className="text-slate-400"> — {h.reason}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


