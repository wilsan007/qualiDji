import React, { useCallback, useEffect, useState } from 'react'
import {
  Archive, CheckCircle2, ChevronDown, ChevronRight, Copy, LibraryBig, Pencil,
  Plus, Send, Trash2, X, XCircle,
} from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { cn } from '@/lib/utils'
import {
  workflowsApi, WorkflowActionForm, WorkflowPayload, WorkflowStepForm, WorkflowSummary,
} from '@/lib/api'

/** Module B — Bibliothèque de workflows (V5 §5.2). Cycle : brouillon → revue → approbation → publication. */

const STATUS_META: Record<WorkflowSummary['status'], { label: string; badge: string }> = {
  draft: { label: 'Brouillon', badge: 'bg-slate-100 text-slate-700' },
  in_review: { label: 'En revue', badge: 'bg-amber-100 text-amber-800' },
  published: { label: 'Publié', badge: 'bg-emerald-100 text-emerald-800' },
  deprecated: { label: 'Déprécié', badge: 'bg-rose-100 text-rose-800' },
}

const FREQUENCY_LABELS: Record<string, string> = {
  annual: 'Annuelle',
  event_based: 'À évènement',
  continuous: 'Continue',
}

const STEP_TYPE_LABELS: Record<string, string> = {
  instruction: 'Instruction',
  text_input: 'Texte',
  number_input: 'Nombre',
  choice: 'Choix',
  checkbox: 'Case à cocher',
  date: 'Date',
  signature: 'Signature',
  photo: 'Photo',
  file_upload: 'Fichier',
  barcode: 'Code-barres',
  qr_scan: 'QR code',
  sensor_value: 'Capteur',
  location_check: 'Position',
  confirmation: 'Confirmation',
  knowledge_question: 'Question de connaissance',
  approval: 'Approbation',
}

function emptyStep(seq: number): WorkflowStepForm {
  return {
    sequence: seq,
    title: '',
    instruction: '',
    step_type: 'text_input',
    required: true,
    evidence_requirement: 'auto_save',
    ai_guidance_enabled: true,
    guardrails: [],
  }
}

function emptyAction(sort: number): WorkflowActionForm {
  return {
    title: '',
    objective: '',
    assigned_role: 'operator',
    sort_order: sort,
    steps: [emptyStep(1)],
  }
}

function emptyForm(): WorkflowPayload {
  return {
    name: '',
    standard_clause: '',
    owner_role: 'quality_manager',
    frequency: 'event_based',
    actions: [emptyAction(1)],
  }
}

function StatusBadge({ status }: { status: WorkflowSummary['status'] }) {
  const meta = STATUS_META[status] ?? STATUS_META.draft
  return (
    <span className={cn('badge whitespace-nowrap', meta.badge)}>{meta.label}</span>
  )
}

/** Modale de motif (rejet, duplication, dépréciation) — le motif est obligatoire côté API. */
function ReasonModal({
  title, confirmLabel, onClose, onConfirm, busy,
}: {
  title: string
  confirmLabel: string
  onClose: () => void
  onConfirm: (reason: string) => void
  busy: boolean
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Motif (obligatoire)…"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={busy || reason.trim().length < 3}
            className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

type ModalState =
  | { kind: 'reject'; wf: WorkflowSummary }
  | { kind: 'duplicate'; wf: WorkflowSummary }
  | { kind: 'deprecate'; wf: WorkflowSummary }
  | null

type DetailState = { workflow: WorkflowSummary; actions: (WorkflowActionForm & { id: string })[] } | null

export default function Workflows() {
  const { has } = usePermissions()
  const canCreate = has('workflow.create')
  const canEditDraft = has('workflow.edit_draft')
  const canApprove = has('workflow.approve')

  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [statusFilter, setStatusFilter] = useState<'published' | 'all' | WorkflowSummary['status']>('published')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailState>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [editor, setEditor] = useState<null | { mode: 'create' } | { mode: 'edit'; id: string }>(null)
  const [form, setForm] = useState<WorkflowPayload>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')

  const includeAll = canApprove && statusFilter !== 'published'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await workflowsApi.list(includeAll)
      setWorkflows(res.workflows ?? [])
      setError('')
    } catch (e: any) {
      setError(e.message ?? 'chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [includeAll])

  useEffect(() => {
    void load()
  }, [load])

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 4000)
  }

  const run = async (id: string, fn: () => Promise<unknown>, successMsg: string) => {
    setBusyId(id)
    try {
      await fn()
      flash(successMsg)
      await load()
      if (expanded === id) setExpanded(null)
      return true
    } catch (e: any) {
      setError(e.message ?? 'opération impossible')
      return false
    } finally {
      setBusyId('')
    }
  }

  const toggleDetail = async (id: string) => {
    if (expanded === id) {
      setExpanded(null)
      setDetail(null)
      return
    }
    try {
      const res = await workflowsApi.get(id)
      setDetail(res)
      setExpanded(id)
    } catch (e: any) {
      setError(e.message ?? 'détail indisponible')
    }
  }

  const openCreate = () => {
    setForm(emptyForm())
    setEditor({ mode: 'create' })
    setError('')
  }

  const openEdit = async (wf: WorkflowSummary) => {
    try {
      const res = await workflowsApi.get(wf.id)
      setForm({
        name: res.workflow.name,
        standard_clause: res.workflow.standard_clause,
        owner_role: res.workflow.owner_role,
        frequency: res.workflow.frequency,
        actions: res.actions.map((a: any) => ({
          title: a.title,
          objective: a.objective,
          assigned_role: a.assigned_role,
          sort_order: a.sort_order,
          steps: (a.steps ?? []).map((s: any) => ({
            sequence: s.sequence,
            title: s.title,
            instruction: s.instruction,
            step_type: s.step_type,
            required: s.required,
            validation_rule: s.validation_rule,
            evidence_requirement: s.evidence_requirement,
            approver_role: s.approver_role,
            segregation_of_duties: s.segregation_of_duties,
            ai_guidance_enabled: s.ai_guidance_enabled,
            ai_prompt_template: s.ai_prompt_template,
            guardrails: s.guardrails ?? [],
            choices: s.choices,
          })),
        })),
      })
      setEditor({ mode: 'edit', id: wf.id })
      setError('')
    } catch (e: any) {
      setError(e.message ?? 'édition impossible')
    }
  }

  const saveForm = async () => {
    setSaving(true)
    try {
      if (editor?.mode === 'edit') {
        await workflowsApi.update(editor.id, form)
        flash('Brouillon mis à jour')
      } else {
        await workflowsApi.create(form)
        flash('Brouillon créé')
      }
      setEditor(null)
      await load()
    } catch (e: any) {
      setError(e.message ?? 'enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  const confirmModal = async (reason: string) => {
    if (!modal) return
    const { kind, wf } = modal
    const ok = await run(wf.id, () => {
      if (kind === 'reject') return workflowsApi.reject(wf.id, reason)
      if (kind === 'duplicate') return workflowsApi.duplicate(wf.id, reason)
      return workflowsApi.deprecate(wf.id, reason)
    }, kind === 'reject' ? 'Workflow rejeté' : kind === 'duplicate' ? 'Nouvelle version créée (brouillon)' : 'Workflow déprécié')
    if (ok) setModal(null)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <LibraryBig className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">Bibliothèque de workflows</h1>
            <p className="text-xs text-slate-500">
              Définitions métier du SMQ — cycle brouillon → revue → approbation → publication (§5.2)
            </p>
          </div>
        </div>
        {canCreate && !editor && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Nouveau workflow
          </button>
        )}
      </div>

      {/* Filtres statut (réservés aux.approveurs : les autres ne voient que le publié) */}
      {canApprove && (
        <div className="flex flex-wrap gap-2">
          {(['published', 'all', 'draft', 'in_review', 'deprecated'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                statusFilter === f ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
              )}
            >
              {f === 'all' ? 'Tous' : STATUS_META[f].label}
            </button>
          ))}
        </div>
      )}

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>}
      {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2">{notice}</div>}

      {/* Éditeur */}
      {editor && (
        <WorkflowEditor
          mode={editor.mode}
          form={form}
          setForm={setForm}
          saving={saving}
          onSave={saveForm}
          onCancel={() => setEditor(null)}
        />
      )}

      {/* Liste */}
      {loading ? (
        <div className="text-center text-sm text-slate-500 py-10">Chargement…</div>
      ) : workflows.length === 0 ? (
        <div className="text-center text-sm text-slate-500 py-10 bg-white rounded-xl border border-slate-200">
          Aucun workflow {statusFilter !== 'published' ? 'pour ce filtre' : 'publié'}.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
                <th className="px-4 py-2.5 font-medium">Code</th>
                <th className="px-4 py-2.5 font-medium">Nom</th>
                <th className="px-4 py-2.5 font-medium">Clause</th>
                <th className="px-4 py-2.5 font-medium">Version</th>
                <th className="px-4 py-2.5 font-medium">Fréquence</th>
                <th className="px-4 py-2.5 font-medium">Statut</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workflows.map((wf) => (
                <WorkflowRow
                  key={wf.id}
                  wf={wf}
                  expanded={expanded === wf.id}
                  detail={detail}
                  busy={busyId === wf.id}
                  deleteConfirm={deleteConfirm}
                  setDeleteConfirm={setDeleteConfirm}
                  canCreate={canCreate}
                  canEditDraft={canEditDraft}
                  canApprove={canApprove}
                  onToggle={() => void toggleDetail(wf.id)}
                  onEdit={() => void openEdit(wf)}
                  onSubmit={() => void run(wf.id, () => workflowsApi.submit(wf.id), 'Soumis en revue')}
                  onApprove={() => void run(wf.id, () => workflowsApi.approve(wf.id), 'Workflow publié')}
                  onReject={() => setModal({ kind: 'reject', wf })}
                  onDuplicate={() => setModal({ kind: 'duplicate', wf })}
                  onDeprecate={() => setModal({ kind: 'deprecate', wf })}
                  onDelete={() =>
                    void run(wf.id, async () => {
                      await workflowsApi.remove(wf.id)
                    }, 'Workflow supprimé')
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ReasonModal
          title={
            modal.kind === 'reject' ? `Rejeter « ${modal.wf.name} »`
            : modal.kind === 'duplicate' ? `Dupliquer « ${modal.wf.name} » (motif de modification)`
            : `Déprécier « ${modal.wf.name} »`
          }
          confirmLabel={modal.kind === 'reject' ? 'Rejeter' : modal.kind === 'duplicate' ? 'Créer la version' : 'Déprécier'}
          busy={busyId === modal.wf.id}
          onClose={() => setModal(null)}
          onConfirm={(r) => void confirmModal(r)}
        />
      )}
    </div>
  )
}

/** Ligne de la bibliothèque : boutons d'action gated par permission + détail dépliable. */
function WorkflowRow({
  wf, expanded, detail, busy, deleteConfirm, setDeleteConfirm,
  canCreate, canEditDraft, canApprove,
  onToggle, onEdit, onSubmit, onApprove, onReject, onDuplicate, onDeprecate, onDelete,
}: {
  wf: WorkflowSummary
  expanded: boolean
  detail: DetailState
  busy: boolean
  deleteConfirm: string
  setDeleteConfirm: (v: string) => void
  canCreate: boolean
  canEditDraft: boolean
  canApprove: boolean
  onToggle: () => void
  onEdit: () => void
  onSubmit: () => void
  onApprove: () => void
  onReject: () => void
  onDuplicate: () => void
  onDeprecate: () => void
  onDelete: () => void
}) {
  const btn = 'p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors'
  // Bibliothèque globale (tenant_id null) : lecture seule — seule la duplication vers le tenant est offerte
  const isGlobal = wf.tenant_id == null
  const showDelete = ['draft', 'in_review', 'deprecated'].includes(wf.status) && canApprove && !isGlobal
  const confirming = deleteConfirm === wf.id

  return (
    <>
      <tr className={cn('hover:bg-slate-50', expanded && 'bg-slate-50/60')}>
        <td className="px-4 py-2.5">
          <button onClick={onToggle} className="flex items-center gap-1.5 font-mono text-xs text-slate-600 hover:text-blue-600">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {wf.id}
            {isGlobal && <span className="badge ml-1 bg-slate-100 text-slate-600" title="Bibliothèque globale : lecture seule, dupliquez-la pour l'adapter à votre tenant">global</span>}
          </button>
        </td>
        <td className="px-4 py-2.5 font-medium text-slate-800">{wf.name}</td>
        <td className="px-4 py-2.5 text-slate-600">{wf.standard_clause}</td>
        <td className="px-4 py-2.5 text-slate-600">v{wf.version}</td>
        <td className="px-4 py-2.5 text-slate-600">{FREQUENCY_LABELS[wf.frequency] ?? wf.frequency}</td>
        <td className="px-4 py-2.5"><StatusBadge status={wf.status} /></td>
        <td className="px-4 py-2.5">
          <div className="flex items-center justify-end gap-1">
            {wf.status === 'draft' && canEditDraft && !isGlobal && (
              <>
                <button onClick={onEdit} disabled={busy} title="Éditer le brouillon" className={btn}>
                  <Pencil className="w-4 h-4 text-slate-500" />
                </button>
                <button onClick={onSubmit} disabled={busy} title="Soumettre en revue" className={btn}>
                  <Send className="w-4 h-4 text-slate-500" />
                </button>
              </>
            )}
            {wf.status === 'in_review' && canApprove && !isGlobal && (
              <>
                <button onClick={onApprove} disabled={busy} title="Approuver (publication)" className={btn}>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </button>
                <button onClick={onReject} disabled={busy} title="Rejeter (motif requis)" className={btn}>
                  <XCircle className="w-4 h-4 text-rose-500" />
                </button>
              </>
            )}
            {(wf.status === 'published' || wf.status === 'in_review') && canCreate && (
              <button onClick={onDuplicate} disabled={busy} title="Dupliquer (nouvelle version, motif requis)" className={btn}>
                <Copy className="w-4 h-4 text-slate-500" />
              </button>
            )}
            {(wf.status === 'published' || wf.status === 'in_review') && canApprove && !isGlobal && (
              <button onClick={onDeprecate} disabled={busy} title="Déprécier (motif requis)" className={btn}>
                <Archive className="w-4 h-4 text-slate-500" />
              </button>
            )}
            {showDelete && (
              confirming ? (
                <>
                  <button onClick={onDelete} disabled={busy} className="px-2 py-0.5 text-[11px] rounded bg-rose-600 text-white hover:bg-rose-700">
                    Confirmer ?
                  </button>
                  <button onClick={() => setDeleteConfirm('')} className="px-2 py-0.5 text-[11px] rounded border border-slate-300 text-slate-500">
                    Non
                  </button>
                </>
              ) : (
                <button onClick={() => setDeleteConfirm(wf.id)} disabled={busy} title="Supprimer (jamais publié)" className={btn}>
                  <Trash2 className="w-4 h-4 text-slate-500" />
                </button>
              )
            )}
          </div>
        </td>
      </tr>
      {expanded && detail && detail.workflow.id === wf.id && (
        <tr className="bg-slate-50/60">
          <td colSpan={7} className="px-6 py-4 border-t border-slate-100">
            <div className="space-y-3">
              {detail.workflow.change_reason && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 inline-block">
                  Motif de version : {detail.workflow.change_reason}
                </p>
              )}
              {detail.workflow.review_comment && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2.5 py-1.5 inline-block">
                  Dernier rejet : {detail.workflow.review_comment}
                </p>
              )}
              {(detail.actions ?? []).map((a, ai) => (
                <div key={a.id ?? ai} className="bg-white rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-800">
                    Action {ai + 1} — {a.title} <span className="text-slate-400 font-normal">· rôle : {a.assigned_role}</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{a.objective}</p>
                  <ol className="mt-2 space-y-1">
                    {(a.steps ?? []).map((s, si) => (
                      <li key={s.id ?? si} className="text-xs text-slate-600 flex items-start gap-2">
                        <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-medium">
                          {s.sequence ?? si + 1}
                        </span>
                        <span>
                          <span className="font-medium text-slate-700">{s.title}</span>
                          {' — '}
                          {STEP_TYPE_LABELS[s.step_type] ?? s.step_type}
                          {s.required && <span className="text-rose-500"> · requis</span>}
                          <br />
                          <span className="text-slate-400">{s.instruction}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

const inputCls =
  'w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const labelCls = 'block text-xs font-medium text-slate-600 mb-1'

/** Éditeur de brouillon : identité + actions + étapes (§5.2 / Annexe B types de saisie). */
function WorkflowEditor({
  mode, form, setForm, saving, onSave, onCancel,
}: {
  mode: 'create' | 'edit'
  form: WorkflowPayload
  setForm: (f: WorkflowPayload) => void
  saving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  const patch = (p: Partial<WorkflowPayload>) => setForm({ ...form, ...p })

  const patchAction = (ai: number, p: Partial<WorkflowActionForm>) => {
    const actions = form.actions.map((a, i) => (i === ai ? { ...a, ...p } : a))
    patch({ actions })
  }
  const patchStep = (ai: number, si: number, p: Partial<WorkflowStepForm>) => {
    const actions = form.actions.map((a, i) =>
      i === ai ? { ...a, steps: a.steps.map((s, j) => (j === si ? { ...s, ...p } : s)) } : a
    )
    patch({ actions })
  }

  const valid =
    form.name.trim().length >= 3 &&
    form.standard_clause.trim().length >= 1 &&
    form.actions.length >= 1 &&
    form.actions.every(
      (a) => a.title.trim() && a.objective.trim() && a.steps.length >= 1 &&
        a.steps.every((s) => s.title.trim() && s.instruction.trim())
    )

  return (
    <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">
          {mode === 'edit' ? 'Éditer le brouillon' : 'Nouveau workflow (brouillon)'}
        </h2>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600" aria-label="Fermer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Identité */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="sm:col-span-2">
          <label className={labelCls}>Nom du workflow *</label>
          <input className={inputCls} value={form.name} onChange={(e) => patch({ name: e.target.value })}
            placeholder="Ex. Analyse du contexte organisationnel" />
        </div>
        <div>
          <label className={labelCls}>Clause ISO *</label>
          <input className={inputCls} value={form.standard_clause} onChange={(e) => patch({ standard_clause: e.target.value })}
            placeholder="Ex. 4.1" />
        </div>
        <div>
          <label className={labelCls}>Fréquence</label>
          <select className={inputCls} value={form.frequency} onChange={(e) => patch({ frequency: e.target.value })}>
            <option value="event_based">À évènement</option>
            <option value="annual">Annuelle</option>
            <option value="continuous">Continue</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Propriétaire (rôle)</label>
          <input className={inputCls} value={form.owner_role} onChange={(e) => patch({ owner_role: e.target.value })}
            placeholder="quality_manager" />
        </div>
        {mode === 'create' && (
          <div>
            <label className={labelCls}>Code (optionnel, auto sinon)</label>
            <input className={cn(inputCls, 'font-mono')} value={form.code ?? ''} onChange={(e) => patch({ code: e.target.value || undefined })}
              placeholder="WF_MAINTENANCE_ANNUELLE" />
          </div>
        )}
      </div>

      {/* Actions + étapes */}
      <div className="space-y-4">
        {form.actions.map((a, ai) => (
          <div key={ai} className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action {ai + 1}</span>
              {form.actions.length > 1 && (
                <button
                  onClick={() => patch({ actions: form.actions.filter((_, i) => i !== ai) })}
                  className="text-xs text-rose-500 hover:text-rose-700"
                >
                  Retirer
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Titre *</label>
                <input className={inputCls} value={a.title} onChange={(e) => patchAction(ai, { title: e.target.value })}
                  placeholder="Ex. Identifier les facteurs" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Objectif *</label>
                <input className={inputCls} value={a.objective} onChange={(e) => patchAction(ai, { objective: e.target.value })}
                  placeholder="Ce que l'action doit produire" />
              </div>
              <div>
                <label className={labelCls}>Rôle exécutant</label>
                <input className={inputCls} value={a.assigned_role} onChange={(e) => patchAction(ai, { assigned_role: e.target.value })}
                  placeholder="operator" />
              </div>
            </div>

            <div className="space-y-2">
              {a.steps.map((s, si) => (
                <div key={si} className="bg-white rounded-lg border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Étape {si + 1}</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input type="checkbox" checked={s.required} onChange={(e) => patchStep(ai, si, { required: e.target.checked })} />
                        Requise
                      </label>
                      {a.steps.length > 1 && (
                        <button
                          onClick={() =>
                            patchAction(ai, { steps: a.steps.filter((_, j) => j !== si).map((st, j) => ({ ...st, sequence: j + 1 })) }
                            )
                          }
                          className="text-xs text-rose-500 hover:text-rose-700"
                        >
                          Retirer
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input className={inputCls} value={s.title} onChange={(e) => patchStep(ai, si, { title: e.target.value })}
                      placeholder="Titre de l'étape *" />
                    <select className={inputCls} value={s.step_type} onChange={(e) => patchStep(ai, si, { step_type: e.target.value })}>
                      {Object.entries(STEP_TYPE_LABELS).map(([code, lbl]) => (
                        <option key={code} value={code}>{lbl}</option>
                      ))}
                    </select>
                    <input className={inputCls} value={s.validation_rule ?? ''} onChange={(e) => patchStep(ai, si, { validation_rule: e.target.value || null })}
                      placeholder="Règle (ex. min_length:50)" />
                  </div>
                  <textarea rows={2} className={inputCls} value={s.instruction}
                    onChange={(e) => patchStep(ai, si, { instruction: e.target.value })}
                    placeholder="Instruction opérateur *" />
                </div>
              ))}
              <button
                onClick={() => patchAction(ai, { steps: [...a.steps, emptyStep(a.steps.length + 1)] })}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                + Ajouter une étape
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => patch({ actions: [...form.actions, emptyAction(form.actions.length + 1)] })}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          + Ajouter une action
        </button>
      </div>

      {/* Sauvegarde */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
          Annuler
        </button>
        <button
          onClick={onSave}
          disabled={saving || !valid}
          className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : mode === 'edit' ? 'Enregistrer le brouillon' : 'Créer le brouillon'}
        </button>
      </div>
    </div>
  )
}






