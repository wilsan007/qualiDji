import type { ComponentType } from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'

/** Spinner centré de page. */
export function PageLoader({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  )
}

/** Bandeau d'erreur avec bouton réessayer optionnel. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty-state card border-red-200 bg-red-50/50">
      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
        <AlertTriangle className="w-6 h-6 text-red-600" />
      </div>
      <p className="text-sm font-medium text-red-800">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
        >
          Réessayer
        </button>
      )}
    </div>
  )
}

/** État vide avec illustration d'icône. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
}: {
  icon?: ComponentType<{ className?: string }>
  title: string
  hint?: string
}) {
  return (
    <div className="empty-state">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <Icon className="w-7 h-7 text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="text-xs text-slate-500 mt-1 max-w-sm">{hint}</p>}
    </div>
  )
}