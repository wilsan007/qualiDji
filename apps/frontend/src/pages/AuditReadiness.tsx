import { useCallback, useEffect, useState } from 'react'
import { dashboardApi, reportsApi } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/States'
import { Activity, CheckCircle, Clock, Download, FileText, RefreshCw, ShieldCheck } from 'lucide-react'

/** Traduction des actions du journal d'audit. */
const ACTION_LABELS: Record<string, string> = {
  'action.create': 'Action lancée',
  'action.assign': 'Action réassignée',
  'action.start': 'Action démarrée',
  'action.submit': "Action soumise à l'évaluateur",
  'action.approve': 'Action validée',
  'action.reject': 'Action rejetée',
  'action.approve_blocked': 'Validation refusée (séparation des tâches)',
  'action.exception': 'Exception déclarée sur une action',
  'action.block': 'Action bloquée (exception)',
  'step.submit': 'Étape de terrain soumise',
  'evidence.upload': 'Preuve téléversée',
  'evidence.record': 'Preuve (mesure/texte) enregistrée',
  'evidence.download': 'Preuve téléchargée',
  'evidence.delete': 'Preuve supprimée',
  'nc.create': 'Non-conformité déclarée',
  'nonconformity.create': 'Non-conformité déclarée',
  'nc.capa': 'Plan CAPA enregistré',
  'capa.create': 'Plan CAPA enregistré',
  'capa.effectiveness_check': "Efficacité d'une CAPA vérifiée",
  'document.create': 'Document créé (brouillon)',
  'document.update_draft': 'Brouillon de document modifié',
  'document.submit': 'Document soumis en revue',
  'document.approve': 'Document approuvé et publié',
  'document.reject': 'Document rejeté',
  'document.duplicate': 'Nouvelle version de document',
  'document.deprecate': 'Document déprécié',
  'document.delete': 'Document supprimé (jamais publié)',
  'workflow.create': 'Workflow créé (brouillon)',
  'workflow.update_draft': 'Brouillon de workflow modifié',
  'workflow.submit': 'Workflow soumis en revue',
  'workflow.approve': 'Workflow approuvé et publié',
  'workflow.reject': 'Workflow rejeté',
  'workflow.duplicate': 'Nouvelle version de workflow',
  'workflow.deprecate': 'Workflow déprécié',
  'workflow.delete': 'Workflow supprimé (jamais publié)',
  'audit.create': 'Audit interne planifié',
  'audit.start': 'Audit interne démarré',
  'audit.finding': "Constat d'audit enregistré",
  'audit.finding_respond': "Réponse à un constat d'audit",
  'audit.finding_verified': "Vérification d'efficacité d'un constat",
  'audit.close': 'Audit interne clôturé',
  'audit.auto_audit_blocked': 'Auto-audit refusé (séparation des tâches)',
  'audit.verify_blocked': 'Vérification refusée (séparation des tâches)',
  'management_review.create': 'Revue de direction créée',
  'management_review.prefill': 'Entrées de revue consolidées',
  'management_review.update': 'Décisions / actions de revue modifiées',
  'management_review.hold': 'Revue de direction tenue',
  'matrix.requirement.update': 'Ligne de la matrice modifiée',
  'matrix.test.update': "Test d'acceptation enregistré",
  'matrix.requirement.na_approve': 'Non-applicabilité approuvée',
  'matrix.link.add': 'Lien exigence ↔ workflow ajouté',
  'matrix.link.remove': 'Lien exigence ↔ workflow retiré',
  'user.invite': 'Utilisateur invité',
  'user.update': 'Utilisateur modifié (rôle, nom)',
  'user.deactivate': 'Utilisateur suspendu',
  'user.activate': 'Utilisateur réactivé',
  'report.export': 'Export (CSV / paquet)',
  'audit_log.view': "Journal d'audit consulté",
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action
}

/** Bandeau couleur selon l'événement. */
function eventTone(action: string): string {
  if (action.includes('validated') || action.includes('approve')) return 'bg-emerald-100 text-emerald-600'
  if (action.includes('block') || action.includes('nc.create')) return 'bg-red-100 text-red-600'
  if (action.includes('submit') || action.includes('upload')) return 'bg-blue-100 text-blue-600'
  return 'bg-slate-100 text-slate-600'
}

export default function AuditReadiness() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    dashboardApi
      .auditReadiness()
      .then((r: any) => setEvents(r.events ?? []))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <PageLoader label="Chargement du journal d'audit…" />

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Prêt audit</h1>
          <p className="page-subtitle">
            Historique verrouillé des événements et chaîne de preuves pour votre audit ISO 9001
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void reportsApi.exportAuditLog().catch((e) => setError(errorMessage(e)))}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" /> Journal complet (CSV)
          </button>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" /> Actualiser
          </button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {!error && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Événements d'audit
                  </p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{events.length}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                  <Activity className="w-5 h-5" />
                </div>
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Preuves déposées
                  </p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {events.filter((e) => e.action === 'evidence.upload' || e.action === 'evidence.record').length}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <CheckCircle className="w-5 h-5" />
                </div>
              </div>
            </div>
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Étapes saisies
                  </p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {events.filter((e) => e.action === 'step.submit').length}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Journal d'audit</h2>
              <span className="text-xs text-slate-400">
                {events.length > 50 ? `50 derniers sur ${events.length}` : `${events.length} événement(s)`}
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {events.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  title="Aucun événement d'audit pour le moment"
                  hint="Chaque action, soumission d'étape et validation de preuve vient s'ajouter automatiquement ici : c'est la traçabilité que l'auditeur vous demandera."
                />
              ) : (
                events.slice(0, 50).map((e) => (
                  <div
                    key={e.id}
                    className="px-6 py-4 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${eventTone(e.action)}`}
                      >
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {actionLabel(e.action)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {e.actor ?? 'système'} • {e.entity} • {new Date(e.created_at).toLocaleString('fr-FR')}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-slate-400 shrink-0">
                      {new Date(e.created_at).toLocaleTimeString('fr-FR')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}