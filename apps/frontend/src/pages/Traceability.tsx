import { useCallback, useEffect, useMemo, useState } from 'react'
import { matrixApi } from '@/lib/api'
import {
  errorMessage,
  formatDateTime,
  gapStatusBadge,
  gapStatusLabel,
  spaceBadge,
  spaceLabel,
} from '@/lib/format'
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/States'
import { usePermissions } from '@/hooks/usePermissions'
import type { Applicability, MatrixCoverage, MatrixRequirement, MatrixTest } from '@/types'
import {
  AlertTriangle,
  ChevronRight,
  Download,
  FileCheck2,
  RefreshCw,
  Table2,
  X,
} from 'lucide-react'

// ============================================================================
// Matrice de traçabilité ISO 9001:2026 — Cahier des charges V4, annexes K & L.
// La couverture est calculée côté serveur (L.4); l'interface affiche, filtre et
// saisit les décisions (applicabilité K.4, tests K.3, champs K.2) — jamais elle
// ne déclare une exigence couverte de sa propre autorité.
// ============================================================================

const CLAUSES = ['4', '5', '6', '7', '8', '9', '10']
const SPACE_FILTERS = ['C', 'P', 'AE']
const GAP_STATUSES = [
  'not_analyzed',
  'not_covered',
  'partially_covered',
  'ready_to_test',
  'tested',
  'accepted_with_reserve',
  'not_applicable_justified',
]

// Habilitations pilotées par les permissions V5 §3.3 : édition (workflow.edit_draft),
// tests (evidence.upload), export CSV (evidence.export).
// Le contrôle définitif est côté serveur via requirePermission (RBAC V5 §3.3).

/** Puce d'un test MT-<réf>-POS / MT-<réf>-NEG. */
function TestChip({ test, refCode, kind }: { test: MatrixTest | null; refCode: string; kind: 'POS' | 'NEG' }) {
  const status = test?.status ?? 'todo'
  const cls =
    status === 'passed'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'failed'
        ? 'bg-red-50 text-red-700 border-red-200'
        : 'bg-slate-50 text-slate-500 border-slate-200'
  const symbol = status === 'passed' ? '+' : status === 'failed' ? '−' : '·'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium ${cls}`}
      title={test?.scenario ?? `MT-${refCode}-${kind}`}
    >
      {symbol} MT-{refCode}-{kind}
    </span>
  )
}

/** Panneau latéral d'édition d'une ligne de matrice (K.2 / K.3 / K.4). */
function LineEditor({
  line,
  canEdit,
  canTest,
  canApprove,
  onClose,
  onSaved,
}: {
  line: MatrixRequirement
  canEdit: boolean
  canTest: boolean
  canApprove: boolean
  onClose: () => void
  onSaved: (updated: MatrixRequirement) => void
}) {
  const [applicability, setApplicability] = useState<Applicability>(
    line.assessment?.applicability ?? 'applicable'
  )
  const [naJustification, setNaJustification] = useState(line.assessment?.na_justification ?? '')
  const [processOwner, setProcessOwner] = useState(line.process_owner ?? '')
  const [objectiveEvidence, setObjectiveEvidence] = useState(line.objective_evidence ?? '')
  const [softwareControl, setSoftwareControl] = useState(line.software_control ?? '')
  const [verificationMethod, setVerificationMethod] = useState(line.verification_method ?? '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyTest, setBusyTest] = useState('')
  const [err, setErr] = useState('')

  const save = async () => {
    setErr('')
    if (reason.trim().length < 3) {
      setErr('Le motif de modification est obligatoire (traçabilité L.5).')
      return
    }
    setSaving(true)
    try {
      const res = await matrixApi.update(line.id, {
        reason: reason.trim(),
        applicability,
        na_justification: naJustification.trim() || undefined,
        process_owner: processOwner.trim(),
        objective_evidence: objectiveEvidence.trim(),
        software_control: softwareControl.trim(),
        verification_method: verificationMethod.trim(),
      })
      if (res?.requirement) onSaved(res.requirement)
      onClose()
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const recordTest = async (kind: 'positive' | 'negative', status: 'todo' | 'passed' | 'failed') => {
    setErr('')
    setBusyTest(`${kind}-${status}`)
    try {
      const res = await matrixApi.recordTest(line.id, { kind, status })
      if (res?.requirement) onSaved(res.requirement)
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusyTest('')
    }
  }

  const testButtons = (kind: 'positive' | 'negative') => {
    const current = (kind === 'positive' ? line.tests.positive : line.tests.negative)?.status ?? 'todo'
    const options: { value: 'todo' | 'passed' | 'failed'; label: string; cls: string }[] = [
      { value: 'todo', label: 'Non exécuté', cls: 'border-slate-300 text-slate-600 hover:bg-slate-50' },
      { value: 'passed', label: 'Conforme ✓', cls: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50' },
      { value: 'failed', label: 'Non conforme ✗', cls: 'border-red-300 text-red-700 hover:bg-red-50' },
    ]
    return options.map((o) => (
      <button
        key={o.value}
        type="button"
        disabled={!canTest || busyTest !== ''}
        onClick={() => recordTest(kind, o.value)}
        className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40 ${
          current === o.value ? 'ring-2 ring-blue-500/40 bg-blue-50 text-blue-700 border-blue-300' : o.cls
        }`}
      >
        {o.label}
      </button>
    ))
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative w-full max-w-xl bg-white shadow-2xl h-full overflow-y-auto animate-enter">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div className="min-w-0">
            <p className="text-xs font-medium text-blue-600">
              {line.id} — Clause {line.clause}
            </p>
            <h2 className="text-lg font-semibold text-slate-900 mt-0.5">{line.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 shrink-0"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* État calculé par le serveur */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={gapStatusBadge(line.gap_status)}>{gapStatusLabel(line.gap_status)}</span>
              {line.blocking && <span className="badge bg-red-600 text-white">Lacune bloquante</span>}
              {line.spaces.map((s) => (
                <span key={s} className={spaceBadge(s)}>
                  Espace {spaceLabel(s)}
                </span>
              ))}
            </div>
            {line.blocking_reasons.length > 0 && (
              <ul className="mt-3 space-y-1">
                {line.blocking_reasons.map((r) => (
                  <li key={r} className="text-xs text-red-700 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {r}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-500 mt-3">
              Workflows : {line.workflow_codes.join(', ') || '—'} · Dernier motif :{' '}
              {line.assessment?.last_reason ?? '—'}
            </p>
          </div>

          {err && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {err}
            </div>
          )}

          {/* Tests K.3 */}
          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Tests d’acceptation (K.3)</h3>
            <p className="text-xs text-slate-500 mb-3">
              Couple obligatoire MT-{line.source_ref}-POS / MT-{line.source_ref}-NEG avant tout statut
              « couvert ».
            </p>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-600 w-20">Positif</span>
                {testButtons('positive')}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-600 w-20">Négatif</span>
                {testButtons('negative')}
              </div>
            </div>
          </section>

          {/* Applicabilité / non-applicabilité K.4 */}
          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Applicabilité (K.4)</h3>
            <div className="space-y-2">
              {(
                [
                  { value: 'applicable', label: 'Applicable' },
                  { value: 'to_review', label: 'En cours de revue (non analysé)' },
                  { value: 'not_applicable', label: 'Non applicable (justification obligatoire)' },
                ] as { value: Applicability; label: string }[]
              ).map((o) => (
                <label
                  key={o.value}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    applicability === o.value
                      ? 'border-blue-400 bg-blue-50/60 ring-1 ring-blue-400'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="applicability"
                    value={o.value}
                    checked={applicability === o.value}
                    disabled={!canEdit}
                    onChange={() => setApplicability(o.value)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">{o.label}</span>
                </label>
              ))}
            </div>

            {applicability === 'not_applicable' && (
              <div className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                <p className="text-xs text-amber-800">
                  Registre N.10 : justification motivée + approbation (nom et fonction) obligatoires ;
                  la ligne reste visible dans la matrice.
                </p>
                <div>
                  <label className="label">Justification motivée</label>
                  <textarea
                    className="input min-h-[80px]"
                    value={naJustification}
                    disabled={!canEdit}
                    onChange={(e) => setNaJustification(e.target.value)}
                    placeholder="Ex. L’organisation ne réalise pas de conception/développement…"
                  />
                </div>
                <div>
                  <label className="label">Approbation (K.4)</label>
                  {line.assessment?.na_approved_at ? (
                    <p className="text-sm text-emerald-700">
                      Approuvée par {line.assessment?.na_approved_by} — personne distincte du demandeur.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-amber-700">
                        En attente d’approbation par une personne distincte du demandeur (le nom est fixé par le serveur).
                      </p>
                      {canApprove && line.assessment?.applicability === 'not_applicable' && (
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={saving}
                          onClick={async () => {
                            setErr('')
                            setSaving(true)
                            try {
                              const res = await matrixApi.approveNa(line.id)
                              if (res?.requirement) onSaved(res.requirement)
                              onClose()
                            } catch (e) {
                              setErr(errorMessage(e))
                            } finally {
                              setSaving(false)
                            }
                          }}
                        >
                          Approuver la non-applicabilité
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Champs de couverture K.2 */}
          {canEdit && (
            <section>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">
                Fonction, preuve et contrôle (K.2)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Responsable</label>
                  <input
                    className="input"
                    value={processOwner}
                    onChange={(e) => setProcessOwner(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Contrôle logiciel</label>
                  <input
                    className="input"
                    value={softwareControl}
                    onChange={(e) => setSoftwareControl(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Preuve attendue</label>
                  <input
                    className="input"
                    value={objectiveEvidence}
                    onChange={(e) => setObjectiveEvidence(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Méthode de vérification</label>
                  <input
                    className="input"
                    value={verificationMethod}
                    onChange={(e) => setVerificationMethod(e.target.value)}
                  />
                </div>
              </div>
            </section>
          )}

          {/* Motif + enregistrement */}
          <section className="border-t border-slate-200 pt-5">
            {canEdit ? (
              <>
                <label className="label">Motif de la modification (obligatoire — L.5)</label>
                <input
                  className="input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex. Revue annuelle de la matrice, ligne confirmée"
                />
                <button
                  onClick={save}
                  disabled={saving || reason.trim().length < 3}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40"
                >
                  <FileCheck2 className="w-4 h-4" />
                  {saving ? 'Enregistrement…' : 'Enregistrer la ligne'}
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                Consultation seule : votre rôle ne permet pas de modifier la matrice ni d’enregistrer
                des tests.
              </p>
            )}
            <p className="text-[11px] text-slate-400 mt-3">
              Dernière mise à jour : {formatDateTime(line.assessment?.updated_at)}
            </p>
          </section>
        </div>
      </aside>
    </div>
  )
}

/** Page « Matrice de traçabilité » — couverture V4 par clause et par espace. */
export default function Traceability() {
  const { has } = usePermissions()
  const canEdit = has('workflow.edit_draft')
  // H3 : l'enregistrement des tests K.3 exige workflow.edit_draft (plus evidence.upload)
  const canTest = has('workflow.edit_draft')
  const canApprove = has('workflow.approve')
  const canExport = has('evidence.export')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [coverage, setCoverage] = useState<MatrixCoverage | null>(null)
  const [requirements, setRequirements] = useState<MatrixRequirement[]>([])
  const [clause, setClause] = useState('')
  const [space, setSpace] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<MatrixRequirement | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [cov, reqs] = await Promise.all([matrixApi.coverage(), matrixApi.requirements()])
      setCoverage(cov)
      setRequirements(reqs.requirements ?? [])
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(
    () =>
      requirements.filter(
        (r) =>
          (!clause || r.clause === clause) &&
          (!space || r.spaces.includes(space)) &&
          (!status || r.gap_status === status)
      ),
    [requirements, clause, space, status]
  )

  /** Met à jour une ligne en place et recalcule la couverture côté serveur. */
  const handleSaved = useCallback((updated: MatrixRequirement) => {
    setRequirements((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    setSelected((prev) => (prev && prev.id === updated.id ? updated : prev))
    matrixApi
      .coverage()
      .then(setCoverage)
      .catch(() => undefined)
  }, [])

  const handleExport = async () => {
    setExporting(true)
    try {
      await matrixApi.exportCsv()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <PageLoader label="Chargement de la matrice de traçabilité…" />

  const totals = coverage?.totals

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Matrice de traçabilité</h1>
          <p className="page-subtitle">
            Registre des exigences ISO 9001:2026 — clauses 4 à 10, tests ± par exigence et couverture
            par espace (annexes K & L du cahier des charges)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" /> Actualiser
          </button>
          <button
            onClick={handleExport}
            disabled={!canExport || exporting}
            title={canExport ? undefined : 'Export non autorisé (permission evidence.export requise)'}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" /> {exporting ? 'Export…' : 'Exporter (CSV)'}
          </button>
        </div>
      </div>

      {/* Avertissement contractuel (G.3) */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900">
          État de préparation fondé sur les exigences évaluées, les preuves disponibles et les lacunes
          ouvertes. Il ne vaut ni audit indépendant ni certification. Le cahier des charges précise que
          la couverture logicielle ne garantit pas la conformité de l’organisation (G.3).
        </p>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {/* Cartes de synthèse */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Exigences applicables"
          value={totals?.applicable ?? 0}
          tone="text-slate-900"
          hint={`sur ${requirements.filter((r) => r.requirement_type === 'requirement').length} exigences suivies`}
        />
        <StatCard
          label="Testées conformes"
          value={(totals?.tested ?? 0) + (totals?.accepted_with_reserve ?? 0)}
          tone="text-emerald-600"
          hint={`${totals?.tested_pos ?? 0} tests + exécutés · ${totals?.tested_neg ?? 0} tests −`}
        />
        <StatCard
          label="Lacunes bloquantes"
          value={totals?.blocking_gaps ?? 0}
          tone={(totals?.blocking_gaps ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}
          hint="sans fonction, preuve ou couple de tests (H-11 / L.4)"
        />
        <StatCard
          label="Non applicables justifiées"
          value={totals?.na_justified ?? 0}
          tone="text-slate-700"
          hint="registre N.10 — jamais supprimées de la matrice"
        />
      </div>

      {/* Filtres */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label mb-1">Clause</label>
          <select className="input w-40" value={clause} onChange={(e) => setClause(e.target.value)}>
            <option value="">Toutes</option>
            {CLAUSES.map((c) => (
              <option key={c} value={c}>
                Clause {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1">Espace</label>
          <select className="input w-48" value={space} onChange={(e) => setSpace(e.target.value)}>
            <option value="">Tous</option>
            {SPACE_FILTERS.map((s) => (
              <option key={s} value={s}>
                {spaceLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1">Statut de couverture</label>
          <select className="input w-56" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous</option>
            {GAP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {gapStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-500 ml-auto pb-2">
          {filtered.length} ligne(s) affichée(s)
        </p>
      </div>

      {/* Couverture calculée côté serveur (L.4) */}
      {coverage && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Couverture par clause</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Périmètres de réception normatifs (L.2)
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="px-5 py-2 font-medium">Périmètre</th>
                    <th className="px-3 py-2 font-medium text-right">Applic.</th>
                    <th className="px-3 py-2 font-medium text-right">Testés</th>
                    <th className="px-3 py-2 font-medium text-right">À tester</th>
                    <th className="px-3 py-2 font-medium text-right">Non couverts</th>
                    <th className="px-5 py-2 font-medium text-right">Lacunes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {coverage.clauses.map((b) => (
                    <tr key={b.scope} className="hover:bg-slate-50/60">
                      <td className="px-5 py-2.5 text-slate-700">{b.label}</td>
                      <td className="px-3 py-2.5 text-right text-slate-900">{b.applicable}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-600">
                        {b.tested + b.accepted_with_reserve}
                      </td>
                      <td className="px-3 py-2.5 text-right text-blue-600">{b.ready_to_test}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{b.not_covered}</td>
                      <td
                        className={`px-5 py-2.5 text-right font-semibold ${
                          b.blocking_gaps > 0 ? 'text-red-600' : 'text-emerald-600'
                        }`}
                      >
                        {b.blocking_gaps}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Couverture par espace</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Périmètres d’usage : C consultant · P personnel · AE auditeur externe (L.2)
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="px-5 py-2 font-medium">Périmètre</th>
                    <th className="px-3 py-2 font-medium text-right">Applic.</th>
                    <th className="px-3 py-2 font-medium text-right">Testés</th>
                    <th className="px-3 py-2 font-medium text-right">À tester</th>
                    <th className="px-3 py-2 font-medium text-right">Non couverts</th>
                    <th className="px-5 py-2 font-medium text-right">Lacunes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {coverage.spaces.map((b) => (
                    <tr key={b.scope} className="hover:bg-slate-50/60">
                      <td className="px-5 py-2.5 text-slate-700">
                        <span className={spaceBadge(b.scope)}>{b.scope}</span>{' '}
                        <span className="ml-1">{b.label.split('—')[1]?.trim() ?? b.label}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-900">{b.applicable}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-600">
                        {b.tested + b.accepted_with_reserve}
                      </td>
                      <td className="px-3 py-2.5 text-right text-blue-600">{b.ready_to_test}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{b.not_covered}</td>
                      <td
                        className={`px-5 py-2.5 text-right font-semibold ${
                          b.blocking_gaps > 0 ? 'text-red-600' : 'text-emerald-600'
                        }`}
                      >
                        {b.blocking_gaps}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Registre des exigences */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Registre des exigences</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cliquez sur une ligne pour consulter ou éditer (motif obligatoire)
            </p>
          </div>
          {!canEdit && <span className="badge bg-slate-100 text-slate-600">Lecture seule</span>}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Table2}
            title="Aucune exigence ne correspond aux filtres"
            hint="Modifiez la clause, l’espace ou le statut sélectionné."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50/60">
                  <th className="px-5 py-2.5 font-medium">Réf.</th>
                  <th className="px-3 py-2.5 font-medium">Exigence</th>
                  <th className="px-3 py-2.5 font-medium">Responsable</th>
                  <th className="px-3 py-2.5 font-medium">Tests ±</th>
                  <th className="px-3 py-2.5 font-medium">Espaces</th>
                  <th className="px-5 py-2.5 font-medium">Statut</th>
                  <th className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="hover:bg-slate-50/70 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 font-medium text-slate-700 whitespace-nowrap">
                      {r.source_ref}
                    </td>
                    <td className="px-3 py-3 text-slate-800 max-w-md">
                      <p className="line-clamp-2">{r.title}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {r.workflow_codes.join(', ') || 'workflow à associer'}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                      {r.process_owner ?? <span className="text-red-500">à renseigner</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <TestChip test={r.tests.positive} refCode={r.source_ref} kind="POS" />
                        <TestChip test={r.tests.negative} refCode={r.source_ref} kind="NEG" />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.spaces.map((s) => (
                          <span key={s} className={spaceBadge(s)}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={gapStatusBadge(r.gap_status)}>
                        {gapStatusLabel(r.gap_status)}
                      </span>
                      {r.blocking && r.blocking_reasons[0] && (
                        <p className="text-[11px] text-red-500 mt-1 max-w-[220px]">
                          {r.blocking_reasons[0]}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-3 text-slate-400">
                      <ChevronRight className="w-4 h-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <LineEditor
          line={selected}
          canEdit={canEdit}
          canTest={canTest}
          canApprove={canApprove}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}









/** Recadre un nombre affiché dans une carte de couverture. */
function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: number
  tone: string
  hint?: string
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}
