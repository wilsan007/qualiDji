import React, { useCallback, useEffect, useState } from 'react'
import { Archive, CheckCircle2, ChevronDown, ChevronRight, Copy, FileText, Pencil, Plus, Send, Trash2, X, XCircle } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { cn } from '@/lib/utils'
import { documentsApi, ControlledDocument, DocumentPayload } from '@/lib/api'

/** §8.6 Documents contrôlés — cycle brouillon → revue → approbation →
 * publication → remplacement/dépréciation. Corpus RAG §7.6 (publiés uniquement). */

const STATUS_META: Record<ControlledDocument['status'], { label: string; badge: string }> = {
  draft: { label: 'Brouillon', badge: 'bg-slate-100 text-slate-700' },
  in_review: { label: 'En revue', badge: 'bg-amber-100 text-amber-800' },
  published: { label: 'Publié', badge: 'bg-emerald-100 text-emerald-800' },
  deprecated: { label: 'Déprécié', badge: 'bg-rose-100 text-rose-800' },
  archived: { label: 'Archivé', badge: 'bg-slate-200 text-slate-600' },
}

const TYPE_LABELS: Record<string, string> = {
  procedure: 'Procédure',
  policy: 'Politique',
  work_instruction: 'Instruction de travail',
  form: 'Formulaire',
  record_reference: 'Référence d’enregistrement',
  other: 'Autre',
}

const CLASS_LABELS: Record<string, string> = {
  public: 'Public',
  internal: 'Interne',
  confidential: 'Confidentiel',
  secret: 'Secret',
}

const inputCls =
  'w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

const DOC_BTN = 'p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-40 transition-colors'

function emptyForm(): DocumentPayload {
  return { title: '', doc_type: 'procedure', classification: 'internal', owner_role: 'quality_manager', excerpt: null }
}

type ModalState = { kind: 'reject' | 'duplicate' | 'deprecate'; doc: ControlledDocument } | null

function ReasonModal({ kind, onClose, onConfirm, busy }: { kind: NonNullable<ModalState>['kind']; onClose: () => void; onConfirm: (reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState('')
  const titles = { reject: 'Motif de rejet', duplicate: 'Motif de modification', deprecate: 'Motif de retrait' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800">{titles[kind]}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif (obligatoire)…"
          className={inputCls} />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">Annuler</button>
          <button onClick={() => onConfirm(reason)} disabled={busy || reason.trim().length < 5}
            className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? '…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Documents() {
  const { has } = usePermissions()
  const canCreate = has('document.create')
  const canEditDraft = has('document.edit_draft')
  const canApprove = has('document.approve')

  const [docs, setDocs] = useState<ControlledDocument[]>([])
  const [includeAll, setIncludeAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [versions, setVersions] = useState<Record<string, any[]>>({})
  const [modal, setModal] = useState<ModalState>(null)
  const [editor, setEditor] = useState<null | { mode: 'create' } | { mode: 'edit'; id: string }>(null)
  const [form, setForm] = useState<DocumentPayload>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')

  const showAll = canApprove && includeAll
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await documentsApi.list(showAll)
      setDocs(res.documents ?? [])
      setError('')
    } catch (e: any) {
      setError(e.message ?? 'chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [showAll])

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
      setExpanded(null)
      return true
    } catch (e: any) {
      setError(e.message ?? 'opération impossible')
      return false
    } finally {
      setBusyId('')
    }
  }

  const toggleDetail = async (d: ControlledDocument) => {
    if (expanded === d.id) {
      setExpanded(null)
      return
    }
    try {
      const res = await documentsApi.get(d.id)
      setVersions((v) => ({ ...v, [d.id]: res.versions ?? [] }))
      setExpanded(d.id)
    } catch (e: any) {
      setError(e.message ?? 'détail indisponible')
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      if (editor?.mode === 'edit') {
        await documentsApi.update(editor.id, form)
        flash('Brouillon mis à jour')
      } else {
        await documentsApi.create(form)
        flash('Document créé (brouillon)')
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
    const { kind, doc } = modal
    const ok = await run(doc.id, () => {
      if (kind === 'reject') return documentsApi.reject(doc.id, reason)
      if (kind === 'duplicate') return documentsApi.duplicate(doc.id, reason)
      return documentsApi.deprecate(doc.id, reason)
    }, kind === 'reject' ? 'Document rejeté' : kind === 'duplicate' ? 'Nouvelle version créée' : 'Document déprécié')
    if (ok) setModal(null)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <FileText className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">Documents contrôlés</h1>
            <p className="text-xs text-slate-500">
              Registre versionné (§8.6) — les documents publiés alimentent l’assistant IA (§7.6)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canApprove && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={includeAll} onChange={(e) => setIncludeAll(e.target.checked)} />
              Afficher brouillons/retirés
            </label>
          )}
          {canCreate && !editor && (
            <button onClick={() => { setForm(emptyForm()); setEditor({ mode: 'create' }) }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
              <Plus className="w-4 h-4" /> Nouveau document
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>}
      {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2">{notice}</div>}

      {editor && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">{editor.mode === 'edit' ? 'Éditer le brouillon' : 'Nouveau document (brouillon)'}</h2>
            <button onClick={() => setEditor(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Titre *</label>
              <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex. Procédure de contrôle à réception" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
              <select className={inputCls} value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value })}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Classification</label>
              <select className={inputCls} value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })}>
                {Object.entries(CLASS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Extrait indexable * <span className="text-slate-400">(alimente l’assistant IA — pas de données personnelles, §7.6/§7.5 R9)</span>
            </label>
            <textarea rows={5} className={inputCls} value={form.excerpt ?? ''}
              onChange={(e) => setForm({ ...form, excerpt: e.target.value || null })}
              placeholder="Résumé opérationnel du document : objet, étapes clés, seuils de référence, liens…" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditor(null)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">Annuler</button>
            <button onClick={() => void save()} disabled={saving || form.title.trim().length < 3 || !form.excerpt?.trim()}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? '…' : editor.mode === 'edit' ? 'Enregistrer' : 'Créer le brouillon'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-sm text-slate-500 py-10">Chargement…</div>
      ) : docs.length === 0 ? (
        <div className="text-center text-sm text-slate-500 py-10 bg-white rounded-xl border border-slate-200">
          Aucun document {showAll ? '' : 'publié'} dans le registre.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
                <th className="px-4 py-2.5 font-medium">Clé</th>
                <th className="px-4 py-2.5 font-medium">Titre</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Classif.</th>
                <th className="px-4 py-2.5 font-medium">Version</th>
                <th className="px-4 py-2.5 font-medium">Statut</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {docs.map((d) => (
                <React.Fragment key={d.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <button onClick={() => void toggleDetail(d)} className="flex items-center gap-1.5 font-mono text-xs text-slate-600 hover:text-blue-600">
                        {expanded === d.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        {d.doc_key}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{d.title}</td>
                    <td className="px-4 py-2.5 text-slate-600">{TYPE_LABELS[d.doc_type] ?? d.doc_type}</td>
                    <td className="px-4 py-2.5 text-slate-500">{CLASS_LABELS[d.classification] ?? d.classification}</td>
                    <td className="px-4 py-2.5 text-slate-600">v{d.version}</td>
                    <td className="px-4 py-2.5"><span className={cn('badge whitespace-nowrap', STATUS_META[d.status]?.badge)}>{STATUS_META[d.status]?.label ?? d.status}</span></td>

                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {d.status === 'draft' && canEditDraft && (
                          <>
                            <button title="Éditer" disabled={busyId === d.id} className={DOC_BTN}
                              onClick={() => { setForm({ title: d.title, doc_type: d.doc_type, classification: d.classification, owner_role: d.owner_role, excerpt: d.excerpt }); setEditor({ mode: 'edit', id: d.id }) }}>
                              <Pencil className="w-4 h-4 text-slate-500" />
                            </button>
                            <button title="Soumettre en revue" disabled={busyId === d.id} className={DOC_BTN}
                              onClick={() => void run(d.id, () => documentsApi.submit(d.id), 'Soumis en revue')}>
                              <Send className="w-4 h-4 text-slate-500" />
                            </button>
                          </>
                        )}
                        {d.status === 'in_review' && canApprove && (
                          <>
                            <button title="Approuver (publication)" disabled={busyId === d.id} className={DOC_BTN}
                              onClick={() => void run(d.id, () => documentsApi.approve(d.id), 'Document publié')}>
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            </button>
                            <button title="Rejeter" disabled={busyId === d.id} className={DOC_BTN} onClick={() => setModal({ kind: 'reject', doc: d })}>
                              <XCircle className="w-4 h-4 text-rose-500" />
                            </button>
                          </>
                        )}
                        {(d.status === 'published' || d.status === 'in_review') && canCreate && (
                          <button title="Nouvelle version (motif requis)" disabled={busyId === d.id} className={DOC_BTN} onClick={() => setModal({ kind: 'duplicate', doc: d })}>
                            <Copy className="w-4 h-4 text-slate-500" />
                          </button>
                        )}
                        {(d.status === 'published' || d.status === 'in_review') && canApprove && (
                          <button title="Déprécier" disabled={busyId === d.id} className={DOC_BTN} onClick={() => setModal({ kind: 'deprecate', doc: d })}>
                            <Archive className="w-4 h-4 text-slate-500" />
                          </button>
                        )}
                        {canApprove && ['draft', 'in_review', 'archived', 'deprecated'].includes(d.status) && (
                          deleteConfirm === d.id ? (
                            <>
                              <button disabled={busyId === d.id} className="px-2 py-0.5 text-[11px] rounded bg-rose-600 text-white hover:bg-rose-700"
                                onClick={() => void run(d.id, () => documentsApi.remove(d.id), 'Document supprimé')}>Confirmer ?</button>
                              <button onClick={() => setDeleteConfirm('')} className="px-2 py-0.5 text-[11px] rounded border border-slate-300 text-slate-500">Non</button>
                            </>
                          ) : (
                            <button title="Supprimer (jamais publié)" disabled={busyId === d.id} className={DOC_BTN} onClick={() => setDeleteConfirm(d.id)}>
                              <Trash2 className="w-4 h-4 text-slate-500" />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === d.id && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={7} className="px-6 py-3 border-t border-slate-100">
                        <p className="text-xs text-slate-700 whitespace-pre-wrap mb-2">{d.excerpt ?? 'Aucun extrait indexable.'}</p>
                        {d.change_reason && <p className="text-xs text-amber-700 mb-1">Motif : {d.change_reason}</p>}
                        {d.review_comment && <p className="text-xs text-rose-700 mb-1">Dernier rejet : {d.review_comment}</p>}
                        <p className="text-[11px] font-semibold text-slate-500 mb-1">Historique des versions</p>
                        <ul className="space-y-0.5">
                          {(versions[d.id] ?? []).map((v: any) => (
                            <li key={v.id} className="text-xs text-slate-600">
                              v{v.version} · {(STATUS_META as Record<string, { label: string }>)[v.status]?.label ?? v.status} · {new Date(v.created_at).toLocaleDateString('fr-FR')}
                              {v.change_reason && <span className="text-slate-400"> — {v.change_reason}</span>}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ReasonModal kind={modal.kind} busy={busyId === modal.doc.id} onClose={() => setModal(null)}
          onConfirm={(r) => void confirmModal(r)} />
      )}
    </div>
  )
}




