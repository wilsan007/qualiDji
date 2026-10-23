import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { actionsApi, stepsApi } from '@/lib/api'
import { WorkflowStep } from '@/components/WorkflowStep'
import { AIGuidancePanel } from '@/components/AIGuidancePanel'
import { EvidenceUploader } from '@/components/EvidenceUploader'
import { Button } from '@/components/ui/Button'
import { usePermissions } from '@/hooks/usePermissions'
import { PageLoader, ErrorState } from '@/components/ui/States'
import { statusBadge, statusLabel, formatDate, formatDateTime, errorMessage } from '@/lib/format'
import type { Action, WorkflowStep as WStep } from '@/types'
import { ArrowLeft, Sparkles, ShieldAlert, FileText, User2, Info, CheckCircle2, RotateCcw } from 'lucide-react'

/** Modale de déclaration d'exception → crée une non-conformité et bloque l'action. */
function ExceptionModal({ open, onClose, onConfirm, saving }: {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string, severity: string) => void
  saving: boolean
}) {
  const [reason, setReason] = useState('')
  const [severity, setSeverity] = useState('minor')

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md card p-6 animate-fade-in">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center text-red-600 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Déclarer une exception</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              L'action sera bloquée et une non-conformité sera créée automatiquement.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="exc-reason">Motif de l'exception</label>
            <textarea
              id="exc-reason"
              className="input min-h-[96px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Décrivez précisément l'écart constaté (quoi, où, quand, impact)…"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="exc-sev">Gravité</label>
            <select
              id="exc-sev"
              className="input"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="minor">Mineure</option>
              <option value="major">Majeure</option>
              <option value="critical">Critique</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button
              variant="destructive"
              loading={saving}
              disabled={!reason.trim()}
              onClick={() => onConfirm(reason, severity)}
            >
              Déclarer et créer la NC
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function WorkflowExecution() {
  const { actionId } = useParams()
  const navigate = useNavigate()
  const [action, setAction] = useState<Action | null>(null)
  const [steps, setSteps] = useState<WStep[]>([])
  const [values, setValues] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openStep, setOpenStep] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [exceptionOpen, setExceptionOpen] = useState(false)
  const [reviewComment, setReviewComment] = useState('')
  // Approbation = action.approve (V5 §3.3) — gating UI ; le serveur reste la source de vérité
  // (rôle d'approbateur de la définition + ségrégation des tâches).
  const { has } = usePermissions()
  const canReview = has('action.approve')

  useEffect(() => {
    if (!actionId) {
      setLoading(false)
      return
    }
    actionsApi
      .get(actionId)
      .then((r: any) => {
        setAction(r.action)
        // Saisies déjà enregistrées (reprise après rejet ou rechargement)
        setValues(Object.fromEntries((r.action?.step_submissions ?? []).map((sub: any) => [sub.step_id, sub.value])))
        const wa = r.action?.workflow_actions
        const ws = (wa?.workflow_steps ?? []).sort(
          (a: WStep, b: WStep) => (a.sequence ?? 0) - (b.sequence ?? 0)
        )
        setSteps(ws)
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [actionId])

  const refresh = async () => {
    const r = await actionsApi.get(actionId!)
    setAction(r.action)
  }

  const handleStepChange = (stepId: string, value: any) => {
    setValues((prev) => ({ ...prev, [stepId]: value }))
  }

  const handleSubmitStep = async (step: WStep) => {
    setSaving(true)
    setError('')
    try {
      await stepsApi.submit(actionId!, step.id, values[step.id])
      setOpenStep(null)
      await refresh()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitAction = async () => {
    setSaving(true)
    setError('')
    try {
      await actionsApi.submit(actionId!)
      await refresh()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const handleReview = async (decision: 'approve' | 'reject') => {
    setSaving(true)
    setError('')
    try {
      if (decision === 'approve') await actionsApi.approve(actionId!, reviewComment.trim() || undefined)
      else await actionsApi.reject(actionId!, reviewComment.trim())
      setReviewComment('')
      await refresh()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const handleExceptionConfirm = async (reason: string, severity: string) => {
    setSaving(true)
    setError('')
    try {
      await actionsApi.exception(actionId!, { reason, severity })
      setExceptionOpen(false)
      await refresh()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader label="Chargement du workflow…" />

  // Aucune action sélectionnée → guider vers le tableau de bord
  if (!actionId) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="card empty-state">
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-3">
            <FileText className="w-7 h-7 text-blue-600" />
          </div>
          <p className="text-sm font-medium text-slate-800">Sélectionnez une action à réaliser</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Ouvrez une action depuis votre tableau de bord pour suivre les étapes, générer le
            guidage IA et joindre vos preuves terrain.
          </p>
          <Link
            to="/dashboard"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Aller au tableau de bord
          </Link>
        </div>
      </div>
    )
  }

  if (!action) {
    return <ErrorState message={error || 'Action introuvable.'} />
  }

  const canEdit = action.status === 'assigned' || action.status === 'in_progress'

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <ExceptionModal
        open={exceptionOpen}
        onClose={() => setExceptionOpen(false)}
        onConfirm={handleExceptionConfirm}
        saving={saving}
      />

      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 transition-colors mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Tableau de bord
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              {action.workflow_actions?.title || 'Action'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {action.workflow_definitions?.name} • Clause {action.workflow_definitions?.standard_clause} •
              {' '}{action.workflow_definitions?.owner_role}
            </p>
          </div>
          <span className={statusBadge(action.status)}>{statusLabel(action.status)}</span>
        </div>

        {action.status === 'blocked' && (
          <div className="mt-4 flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">
              Cette action est bloquée : une exception a été déclarée et une non-conformité
              a été ouverte. Consultez le registre des NC pour le suivi CAPA.
            </p>
          </div>
        )}
      </div>

      {action.status === 'in_progress' && action.review_comment && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <RotateCcw className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            <span className="font-semibold">Action rejetée — à corriger :</span> {action.review_comment}
          </p>
        </div>
      )}

      {action.status === 'approved' && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-900">
            Action approuvée{action.reviewed_at ? ` le ${formatDateTime(action.reviewed_at)}` : ''}
            {action.review_comment ? ` — ${action.review_comment}` : ''}.
          </p>
        </div>
      )}

      {action.status === 'submitted' && canReview && (
        <div className="card p-5 border-blue-200">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Validation de l'action</h2>
          <p className="text-xs text-slate-500 mb-3">
            L'approbateur doit être une personne distincte de l'exécutant (ségrégation des tâches, contrôlée par le serveur).
            Le rejet exige un motif et renvoie l'action à l'exécutant.
          </p>
          <label className="label" htmlFor="review-comment">Commentaire</label>
          <textarea
            id="review-comment"
            className="input min-h-[72px]"
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            placeholder="Commentaire (obligatoire pour un rejet)"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <Button onClick={() => handleReview('approve')} disabled={saving} loading={saving}>
              Approuver
            </Button>
            <Button
              variant="outline"
              onClick={() => handleReview('reject')}
              disabled={saving || reviewComment.trim().length < 3}
            >
              Rejeter
            </Button>
          </div>
        </div>
      )}

      {error && <ErrorState message={error} />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`card overflow-hidden transition ${openStep === step.id ? 'border-blue-300 ring-1 ring-blue-200' : ''}`}
            >
              <WorkflowStep
                step={step}
                value={values[step.id]}
                onChange={(v) => handleStepChange(step.id, v)}
                onSubmit={() => {
                  setOpenStep(step.id)
                  handleSubmitStep(step)
                }}
                submitting={saving}
              />
              {openStep === step.id && (
                <div className="px-5 pb-5 animate-fade-in">
                  <AIGuidancePanel
                    actionId={actionId!}
                    stepId={step.id}
                    onSuggestion={(instruction) => {
                      setValues((prev) => ({ ...prev, [step.id]: instruction }))
                    }}
                  />
                  <EvidenceUploader actionId={actionId!} stepId={step.id} />
                </div>
              )}
            </div>
          ))}

          {canEdit && steps.length > 0 && (
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                onClick={handleSubmitAction}
                disabled={saving || action.status === 'submitted'}
                loading={saving}
              >
                Soumettre l'action complète
              </Button>
              <Button variant="destructive" onClick={() => setExceptionOpen(true)} disabled={saving}>
                <ShieldAlert className="w-4 h-4 mr-2" /> Déclarer une exception
              </Button>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-4">
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-400" /> Contexte de l'action
            </h3>
            <dl className="space-y-2 text-xs text-slate-600">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Référence</dt>
                <dd className="font-mono">{action.id.slice(0, 8)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Assignée à</dt>
                <dd className="flex items-center gap-1">
                  <User2 className="w-3.5 h-3.5" /> {action.assigned_to ? action.assigned_to.slice(0, 8) : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Créée le</dt>
                <dd>{formatDate(action.created_at)}</dd>
              </div>
              {action.submitted_at && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Soumise le</dt>
                  <dd>{formatDateTime(action.submitted_at)}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card p-4 bg-gradient-to-br from-indigo-50 to-white">
            <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" /> Guidage IA
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-2">
              L'IA décompose l'action métier en micro-étapes terrain concrètes. Elle ne crée
              jamais de workflow : elle vous aide simplement à exécuter chaque étape.
            </p>
            <p className="text-[11px] text-slate-400">
              Ouvrez une étape pour générer son guidage détaillé.
            </p>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500" /> Non-conformité
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
              Un écart bloquant sur le terrain ? Déclarez-le : une NC sera créée et l'action
              sera gelée jusqu'au traitement CAPA.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => setExceptionOpen(true)}
              disabled={!canEdit}
            >
              Déclarer une exception
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
