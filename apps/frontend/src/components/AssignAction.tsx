import { useEffect, useState } from 'react'
import { actionsApi, workflowsApi, type Assignee } from '@/lib/api'
import { roleLabel, errorMessage } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { X } from 'lucide-react'

interface WorkflowOption {
  id: string
  name: string
  standard_clause: string
}

interface ActionDefOption {
  id: string
  title: string
  assigned_role?: string | null
}

/** « Prénom Nom (rôle) », repli sur l'e-mail puis l'identifiant court. */
function assigneeLabel(a: Assignee): string {
  return `${a.display_name || a.email || a.id.slice(0, 8)} (${roleLabel(a.role)})`
}

/** Le rôle prévu par la définition d'abord : c'est le choix attendu, les autres restent possibles. */
function sortForRole(list: Assignee[], role?: string | null): Assignee[] {
  if (!role) return list
  return [...list.filter((a) => a.role === role), ...list.filter((a) => a.role !== role)]
}

/** Échéance saisie en date calendaire → fin de journée locale, au format attendu par l'API. */
function endOfDayIso(date: string): string {
  return new Date(`${date}T23:59:59`).toISOString()
}

/**
 * Création + assignation d'une action à partir d'une définition publiée (action.assign).
 * Le serveur reste la source de vérité : workflow publié, assigné actif et porteur de action.execute.
 */
export function NewActionModal({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [defs, setDefs] = useState<ActionDefOption[]>([])
  const [workflowId, setWorkflowId] = useState('')
  const [actionDefId, setActionDefId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError('')
    Promise.all([workflowsApi.list(), actionsApi.assignees()])
      .then(([w, a]: [any, { assignees: Assignee[] }]) => {
        setWorkflows(w.workflows ?? [])
        setAssignees(a.assignees ?? [])
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    setDefs([])
    setActionDefId('')
    if (!workflowId) return
    workflowsApi
      .get(workflowId)
      .then((r: any) => {
        const list: ActionDefOption[] = r.actions ?? []
        setDefs(list)
        if (list.length === 1) setActionDefId(list[0].id)
      })
      .catch((e) => setError(errorMessage(e)))
  }, [workflowId])

  if (!open) return null

  const selectedDef = defs.find((d) => d.id === actionDefId)
  const ordered = sortForRole(assignees, selectedDef?.assigned_role)

  const reset = () => {
    setWorkflowId('')
    setActionDefId('')
    setAssignedTo('')
    setDueDate('')
    setError('')
  }

  const close = () => {
    reset()
    onClose()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await actionsApi.create({
        action_def_id: actionDefId,
        assigned_to: assignedTo,
        due_at: dueDate ? endOfDayIso(dueDate) : null,
      })
      reset()
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
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-lg card p-6 animate-fade-in">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Nouvelle action</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Lancez une action d'un workflow publié et confiez-la à un exécutant.
            </p>
          </div>
          <button onClick={close} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="na-workflow">Workflow *</label>
            <select
              id="na-workflow"
              className="input"
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
              disabled={loading}
              required
            >
              <option value="">{loading ? 'Chargement…' : 'Choisir un workflow publié'}</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — clause {w.standard_clause}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="na-action">Action *</label>
            <select
              id="na-action"
              className="input"
              value={actionDefId}
              onChange={(e) => setActionDefId(e.target.value)}
              disabled={!workflowId}
              required
            >
              <option value="">{workflowId ? "Choisir l'action à lancer" : "Choisir d'abord un workflow"}</option>
              {defs.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
            {selectedDef?.assigned_role && (
              <p className="text-xs text-slate-500 mt-1">
                Rôle prévu par le workflow : {roleLabel(selectedDef.assigned_role)}
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="na-assignee">Assigner à *</label>
            <select
              id="na-assignee"
              className="input"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              disabled={loading}
              required
            >
              <option value="">Choisir un exécutant</option>
              {ordered.map((a) => (
                <option key={a.id} value={a.id}>{assigneeLabel(a)}</option>
              ))}
            </select>
            {!loading && assignees.length === 0 && (
              <p className="text-xs text-amber-700 mt-1">
                Aucun exécutant actif dans l'entreprise : invitez d'abord un responsable de processus ou un opérateur.
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="na-due">Échéance</label>
            <input
              id="na-due"
              className="input"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={close}>Annuler</Button>
            <Button type="submit" loading={saving} disabled={!actionDefId || !assignedTo}>
              Lancer l'action
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

/** Réassignation d'une action encore modifiable (assignée, en cours, bloquée) — action.assign. */
export function ReassignControl({ actionId, currentAssignee, onDone }: {
  actionId: string
  currentAssignee?: string | null
  onDone: () => void
}) {
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [target, setTarget] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  useEffect(() => {
    actionsApi
      .assignees()
      .then((r) => setAssignees(r.assignees ?? []))
      .catch((e) => setError(errorMessage(e)))
  }, [])

  const others = assignees.filter((a) => a.id !== currentAssignee)

  const submit = async () => {
    setSaving(true)
    setError('')
    setDone('')
    try {
      await actionsApi.assign(actionId, target)
      const who = assignees.find((a) => a.id === target)
      setDone(`Action réassignée à ${who ? assigneeLabel(who) : 'la personne choisie'}.`)
      setTarget('')
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <label className="label" htmlFor="reassign">Réassigner à</label>
      <select id="reassign" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">Choisir un autre exécutant</option>
        {others.map((a) => (
          <option key={a.id} value={a.id}>{assigneeLabel(a)}</option>
        ))}
      </select>
      <Button size="sm" variant="outline" onClick={submit} loading={saving} disabled={!target}>
        Réassigner
      </Button>
      {done && <p className="text-xs text-emerald-700">{done}</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
