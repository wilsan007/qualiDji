import { useCallback, useEffect, useState } from 'react'
import { ncApi } from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions'
import {
  ncStatusBadge,
  severityBadge,
  severityLabel,
  formatDate,
  formatDateTime,
  errorMessage,
} from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/States'
import { AlertTriangle, Plus, X, ChevronDown, ShieldCheck } from 'lucide-react'

interface NcItem {
  id: string
  title: string
  severity: string
  status: string
  created_at: string
  capa?: any
}

/** Modale légère pour créer une non-conformité. */
function CreateNcModal({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [severity, setSeverity] = useState('minor')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await ncApi.create({ title, severity })
      setTitle('')
      setSeverity('minor')
      onCreated()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md card p-6 animate-fade-in">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Nouvelle non-conformité</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Décrivez l'écart constaté par rapport au référentiel.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="nc-title">Titre de l'écart</label>
            <input
              id="nc-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : contrôle de température non réalisé le 12/10"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="nc-sev">Gravité</label>
            <select
              id="nc-sev"
              className="input"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="minor">Mineure</option>
              <option value="major">Majeure</option>
              <option value="critical">Critique</option>
            </select>
          </div>
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" loading={saving}>Créer la NC</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

/** Ligne de NC dépliable : détails + formulaire CAPA. */
function NcRow({ nc, onChanged }: { nc: NcItem; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [corrective, setCorrective] = useState('')
  const [responsible, setResponsible] = useState('')
  const [dueDate, setDueDate] = useState('')

  const submitCapa = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await ncApi.capa(nc.id, {
        root_cause: rootCause,
        corrective_action: corrective,
        responsible,
        due_date: dueDate || undefined,
      })
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-6 py-4 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors text-left"
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-red-600 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-slate-900 leading-tight truncate">{nc.title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Réf. {nc.id.slice(0, 8)} • Déclarée le {formatDate(nc.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={severityBadge(nc.severity)}>{severityLabel(nc.severity)}</span>
          <span className={ncStatusBadge(nc.status)}>
            {nc.status === 'open' ? 'Ouverte' : nc.status === 'in_progress' ? 'En cours' : 'Clôturée'}
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="px-6 pb-5 animate-fade-in">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2 text-xs text-slate-600">
            <p><span className="font-medium text-slate-700">Identifiant :</span> {nc.id}</p>
            <p><span className="font-medium text-slate-700">Déclarée le :</span> {formatDateTime(nc.created_at)}</p>
          </div>

          {nc.capa ? (
            <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-4">
              <div className="flex items-center gap-2 text-emerald-800 text-sm font-semibold mb-2">
                <ShieldCheck className="w-4 h-4" /> Plan d'action CAPA enregistré
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Cause racine : {nc.capa.root_cause || '—'}<br />
                Action corrective : {nc.capa.corrective_action || '—'}<br />
                Responsable : {nc.capa.responsible || '—'} — Échéance : {nc.capa.due_date ? formatDate(nc.capa.due_date) : '—'}
              </p>
            </div>
          ) : (
            <form onSubmit={submitCapa} className="mt-3 space-y-3">
              <p className="text-sm font-medium text-slate-700">Lancer un plan CAPA (cause racine + action corrective)</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <input className="input" placeholder="Cause racine" value={rootCause} onChange={(e) => setRootCause(e.target.value)} required />
                <input className="input" placeholder="Action corrective" value={corrective} onChange={(e) => setCorrective(e.target.value)} required />
                <input className="input" placeholder="Responsable" value={responsible} onChange={(e) => setResponsible(e.target.value)} />
                <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <Button size="sm" type="submit" loading={saving}>Enregistrer le CAPA</Button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

export default function NonConformities() {
  const [ncs, setNcs] = useState<NcItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  // Création de NC = action.approve (V5 §3.3) — gating UI ; le serveur reste la source de vérité
  const { has } = usePermissions()
  const canCreateNc = has('action.approve')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    ncApi
      .list()
      .then((r: any) => setNcs(r.nonconformities ?? []))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <PageLoader label="Chargement des non-conformités…" />

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <CreateNcModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={load} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Non-conformités</h1>
          <p className="page-subtitle">Déclarer, traiter et clore les écarts qualité (NC / CAPA)</p>
        </div>
        {canCreateNc && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Nouvelle NC
          </Button>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {!error && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Registre des NC</h2>
            <span className="text-xs text-slate-400">{ncs.length} au total</span>
          </div>
          {ncs.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Aucune non-conformité"
              hint="Tant que les processus sont conformes, rien n'apparaît ici. Une déclaration d'exception depuis une action créera automatiquement une NC."
            />
          ) : (
            ncs.map((nc) => <NcRow key={nc.id} nc={nc} onChanged={load} />)
          )}
        </div>
      )}
    </div>
  )
}