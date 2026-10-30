import { FormEvent, useEffect, useState } from 'react'
import { AlertTriangle, Link2, RotateCcw } from 'lucide-react'
import { matrixApi, workflowsApi } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import type { ExcludedSuggestion, LinkModule, LinkState, MatrixRequirement, RequirementLink } from '@/types'

const STATE_LABEL: Record<LinkState, string> = {
  published: 'Publié',
  in_review: 'En revue',
  draft: 'Brouillon',
  deprecated: 'Déprécié',
  missing: 'Non défini',
  module: 'Module',
}

const STATE_BADGE: Record<LinkState, string> = {
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  module: 'bg-blue-50 text-blue-700 border-blue-200',
  in_review: 'bg-amber-50 text-amber-700 border-amber-200',
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  deprecated: 'bg-slate-100 text-slate-600 border-slate-200',
  missing: 'bg-slate-100 text-slate-500 border-slate-200',
}

const MODULES: { value: LinkModule; label: string }[] = [
  { value: 'audits', label: 'Audits internes' },
  { value: 'reviews', label: 'Revues de direction' },
  { value: 'nonconformities', label: 'Non-conformités et CAPA' },
  { value: 'documents', label: 'Documents contrôlés' },
]

/** Racine d'un code de workflow (retire le suffixe tenant puis la version) — même règle que le serveur (requirementLinks.ts). */
function baseCode(id: string): string {
  return id.replace(/__[0-9a-f]{8}$/, '').replace(/_V\d+$/, '')
}

type Pending =
  | { type: 'remove'; link: RequirementLink }
  | { type: 'exclude'; link: RequirementLink }
  | { type: 'restore'; excluded: ExcludedSuggestion }

/**
 * Workflows et modules liés à une exigence : la carte EFFECTIVE de l'entreprise (suggestions du catalogue,
 * moins celles écartées, plus ses propres liens). C'est de la traçabilité : un lien manquant donne un
 * avertissement, jamais une lacune bloquante — le statut de couverture reste décidé par le serveur.
 */
export function RequirementLinks({
  line,
  canEdit,
  onSaved,
}: {
  line: MatrixRequirement
  canEdit: boolean
  onSaved: (updated: MatrixRequirement) => void
}) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [pendingReason, setPendingReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [addKind, setAddKind] = useState<'workflow' | 'module'>('workflow')
  const [target, setTarget] = useState('')
  const [coverage, setCoverage] = useState<'primary' | 'supporting'>('primary')
  const [addReason, setAddReason] = useState('')
  const [families, setFamilies] = useState<{ family: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Bibliothèque visible : chargée à l'ouverture du formulaire d'ajout (workflows publiés)
  useEffect(() => {
    if (!adding || families.length > 0) return
    workflowsApi
      .list()
      .then((r: { workflows?: { id: string; name: string }[] }) => {
        const seen = new Map<string, string>()
        for (const w of r.workflows ?? []) {
          const family = baseCode(w.id)
          if (!seen.has(family)) seen.set(family, w.name)
        }
        setFamilies([...seen].map(([family, name]) => ({ family, name })))
      })
      .catch((e) => setErr(errorMessage(e)))
  }, [adding, families.length])

  const linked = new Set(line.links.map((l) => `${l.kind}:${l.target}`))
  const workflowOptions = families.filter((f) => !linked.has(`workflow:${f.family}`))
  const moduleOptions = MODULES.filter((m) => !linked.has(`module:${m.value}`))

  const run = async (action: () => Promise<{ requirement?: MatrixRequirement | null }>, done: () => void) => {
    setBusy(true)
    setErr('')
    try {
      const res = await action()
      if (res?.requirement) onSaved(res.requirement)
      done()
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const confirmPending = (e: FormEvent) => {
    e.preventDefault()
    if (!pending) return
    const reason = pendingReason.trim()
    if (reason.length < 3) {
      setErr('Le motif est obligatoire (traçabilité L.5).')
      return
    }
    const reset = () => {
      setPending(null)
      setPendingReason('')
    }
    if (pending.type === 'remove') void run(() => matrixApi.removeLink(line.id, pending.link.id as string, reason), reset)
    else if (pending.type === 'exclude') void run(() => matrixApi.addLink(line.id, { kind: 'exclusion', workflow_family: pending.link.target, reason }), reset)
    else void run(() => matrixApi.removeLink(line.id, pending.excluded.id, reason), reset)
  }

  const submitAdd = (e: FormEvent) => {
    e.preventDefault()
    const reason = addReason.trim()
    if (!target) {
      setErr('Choisissez le workflow ou le module à lier.')
      return
    }
    if (reason.length < 3) {
      setErr('Le motif est obligatoire (traçabilité L.5).')
      return
    }
    const body =
      addKind === 'workflow'
        ? ({ kind: 'workflow', workflow_family: target, coverage_type: coverage, reason } as const)
        : ({ kind: 'module', module: target as LinkModule, coverage_type: coverage, reason } as const)
    void run(() => matrixApi.addLink(line.id, body), () => {
      setAdding(false)
      setTarget('')
      setAddReason('')
      setCoverage('primary')
    })
  }

  const pendingTitle = (p: Pending) =>
    p.type === 'remove'
      ? `Retirer « ${p.link.label} »`
      : p.type === 'exclude'
        ? `Écarter la suggestion « ${p.link.label} »`
        : `Rétablir la suggestion « ${p.excluded.target} »`

  return (
    <section aria-label="Workflows et modules liés">
      <h3 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
        <Link2 className="w-4 h-4 text-slate-400" /> Workflows et modules liés
      </h3>
      <p className="text-xs text-slate-500 mb-3">
        Traçabilité : quel processus couvre cette exigence ? Un lien manquant donne seulement un avertissement, il ne change pas le statut de couverture.
      </p>

      {line.warnings.length > 0 && (
        <div role="status" className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-1">
          {line.warnings.map((w) => (
            <p key={w} className="flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {w}
            </p>
          ))}
        </div>
      )}

      {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{err}</div>}

      {line.links.length === 0 ? (
        <p className="text-xs text-slate-500 mb-3">Aucun lien.</p>
      ) : (
        <ul className="space-y-2 mb-3">
          {line.links.map((l) => (
            <li key={`${l.kind}:${l.target}`} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-800">{l.label}</span>
                {l.kind === 'workflow' && l.label !== l.target && <span className="font-mono text-[11px] text-slate-400">{l.target}</span>}
                <span className={`inline-flex px-2 py-0.5 rounded border text-[11px] font-medium ${STATE_BADGE[l.state]}`}>{STATE_LABEL[l.state]}</span>
                <span className="text-[11px] text-slate-500">{l.origin === 'suggestion' ? 'Suggestion du catalogue' : 'Ajouté par l’entreprise'}</span>
                {l.coverage_type === 'supporting' && <span className="text-[11px] text-slate-500">· Complémentaire</span>}
                {canEdit && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setErr('')
                      setPendingReason('')
                      setPending({ type: l.origin === 'suggestion' ? 'exclude' : 'remove', link: l })
                    }}
                    className="ml-auto text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-40"
                  >
                    {l.origin === 'suggestion' ? 'Écarter' : 'Retirer'}
                  </button>
                )}
              </div>
              {l.reason && <p className="text-[11px] text-slate-500 mt-1">Motif : {l.reason}</p>}
            </li>
          ))}
        </ul>
      )}

      {line.excluded_suggestions.length > 0 && (
        <ul className="space-y-1 mb-3">
          {line.excluded_suggestions.map((x) => (
            <li key={x.id} className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
              <span>
                Suggestion écartée : <span className="font-mono">{x.target}</span> — {x.reason}
              </span>
              {canEdit && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setErr('')
                    setPendingReason('')
                    setPending({ type: 'restore', excluded: x })
                  }}
                  className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 disabled:opacity-40"
                >
                  <RotateCcw className="w-3 h-3" /> Rétablir
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <form onSubmit={confirmPending} className="mb-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-800">{pendingTitle(pending)}</p>
          <label className="label" htmlFor="link-pending-reason">Motif</label>
          <input id="link-pending-reason" className="input" value={pendingReason} onChange={(e) => setPendingReason(e.target.value)} placeholder="Pourquoi ? (obligatoire)" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={busy}>Confirmer</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setPending(null); setErr('') }}>Annuler</Button>
          </div>
        </form>
      )}

      {canEdit && !adding && !pending && (
        <Button type="button" size="sm" variant="outline" onClick={() => { setErr(''); setAdding(true) }}>
          Ajouter un lien
        </Button>
      )}

      {canEdit && adding && (
        <form onSubmit={submitAdd} className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="link-kind">Type de lien</label>
              <select id="link-kind" className="input" value={addKind} onChange={(e) => { setAddKind(e.target.value as 'workflow' | 'module'); setTarget('') }}>
                <option value="workflow">Workflow</option>
                <option value="module">Module</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="link-coverage">Couverture</label>
              <select id="link-coverage" className="input" value={coverage} onChange={(e) => setCoverage(e.target.value as 'primary' | 'supporting')}>
                <option value="primary">Principale</option>
                <option value="supporting">Complémentaire</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="link-target">Cible</label>
            <select id="link-target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">{addKind === 'workflow' ? 'Choisir un workflow' : 'Choisir un module'}</option>
              {addKind === 'workflow'
                ? workflowOptions.map((f) => <option key={f.family} value={f.family}>{f.name} ({f.family})</option>)
                : moduleOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="link-add-reason">Motif</label>
            <input id="link-add-reason" className="input" value={addReason} onChange={(e) => setAddReason(e.target.value)} placeholder="Pourquoi ce lien ? (obligatoire)" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={busy}>Ajouter le lien</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setAdding(false); setErr('') }}>Annuler</Button>
          </div>
        </form>
      )}
    </section>
  )
}
