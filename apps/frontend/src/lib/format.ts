import type { Role } from '@/types'

/**
 * Utilitaires de présentation — libellés FR et badges cohérents.
 */

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    assigned: 'Assignée',
    in_progress: 'En cours',
    submitted: 'Soumise',
    approved: 'Approuvée',
    blocked: 'Bloquée',
    closed: 'Clôturée',
    open: 'Ouverte',
    draft: 'Brouillon',
    effective: 'Efficace',
    ineffective: 'Non efficace',
  }
  return map[status] ?? status
}

/** Classes Tailwind du badge pour un statut d'action / workflow. */
export function statusBadge(status: string): string {
  const base = 'badge'
  switch (status) {
    case 'assigned':
      return `${base} bg-slate-100 text-slate-700`
    case 'in_progress':
      return `${base} bg-amber-100 text-amber-800`
    case 'submitted':
      return `${base} bg-blue-100 text-blue-700`
    case 'approved':
      return `${base} bg-emerald-100 text-emerald-700`
    case 'blocked':
      return `${base} bg-red-100 text-red-700`
    case 'closed':
      return `${base} bg-slate-200 text-slate-600`
    default:
      return `${base} bg-slate-100 text-slate-700`
  }
}

/** Badge d'une non-conformité (ouverture / avancement / clôture). */
export function ncStatusBadge(status: string): string {
  const base = 'badge'
  switch (status) {
    case 'open':
      return `${base} bg-red-100 text-red-700`
    case 'in_progress':
      return `${base} bg-amber-100 text-amber-800`
    case 'closed':
      return `${base} bg-emerald-100 text-emerald-700`
    default:
      return `${base} bg-slate-100 text-slate-700`
  }
}

export function severityBadge(severity: string): string {
  const base = 'badge'
  switch (severity) {
    case 'critical':
      return `${base} bg-red-600 text-white`
    case 'major':
      return `${base} bg-red-100 text-red-700`
    case 'minor':
      return `${base} bg-amber-100 text-amber-800`
    default:
      return `${base} bg-slate-100 text-slate-700`
  }
}

export function severityLabel(severity: string): string {
  const map: Record<string, string> = {
    critical: 'Critique',
    major: 'Majeure',
    minor: 'Mineure',
  }
  return map[severity] ?? severity
}

export function roleLabel(role?: string): string {
  const map: Record<string, string> = {
    admin: 'Administrateur',
    quality_manager: 'Responsable qualité',
    site_manager: 'Responsable de site',
    process_owner: 'Responsable de processus',
    operator: 'Opérateur',
    internal_auditor: 'Auditeur interne',
    external_auditor: 'Auditeur externe',
    director: 'Direction',
    consultant: 'Consultant',
  }
  return role ? map[role] ?? role : '—'
}

// ---------------------------------------------------------------------------
// Espaces d'usage V4 (annexe N.8 / L.2): C = consultant, P = personnel, AE = auditeur
// ---------------------------------------------------------------------------

export interface UserSpace {
  code: 'C' | 'P' | 'AE'
  label: string
  short: string
}

/** Espace d'usage déduit du rôle (périmètre de réception L.2). */
export function spaceForRole(role?: string): UserSpace {
  if (role === 'external_auditor') {
    return { code: 'AE', label: 'Espace 3 — Auditeur externe', short: 'Auditeur externe' }
  }
  if (role === 'consultant') {
    return { code: 'C', label: 'Espace 1 — Consultant / accompagnement', short: 'Consultant' }
  }
  return { code: 'P', label: 'Espace 2 — Personnel interne / auditeur interne', short: 'Personnel interne' }
}

/** Classes du badge d'un espace. */
export function spaceBadge(space: string): string {
  const base = 'badge'
  switch (space) {
    case 'C':
      return `${base} bg-violet-100 text-violet-700`
    case 'P':
      return `${base} bg-blue-100 text-blue-700`
    case 'AE':
      return `${base} bg-teal-100 text-teal-700`
    default:
      return `${base} bg-slate-100 text-slate-700`
  }
}

export function spaceLabel(space: string): string {
  const map: Record<string, string> = { C: 'Consultant', P: 'Personnel', AE: 'Auditeur externe' }
  return map[space] ?? space
}

// ---------------------------------------------------------------------------
// Matrice de traçabilité — statuts de couverture normalisés (V4, section L.4)
// ---------------------------------------------------------------------------

export function gapStatusLabel(status: string): string {
  const map: Record<string, string> = {
    not_analyzed: 'Non analysé',
    not_covered: 'Non couvert',
    partially_covered: 'Partiellement couvert',
    ready_to_test: 'Couvert à tester',
    tested: 'Testé conforme',
    accepted_with_reserve: 'Accepté avec réserve',
    not_applicable_justified: 'Non applicable justifié',
  }
  return map[status] ?? status
}

export function gapStatusBadge(status: string): string {
  const base = 'badge'
  switch (status) {
    case 'tested':
      return `${base} bg-emerald-100 text-emerald-700`
    case 'accepted_with_reserve':
      return `${base} bg-amber-100 text-amber-800`
    case 'ready_to_test':
      return `${base} bg-blue-100 text-blue-700`
    case 'partially_covered':
      return `${base} bg-orange-100 text-orange-700`
    case 'not_covered':
      return `${base} bg-red-100 text-red-700`
    case 'not_analyzed':
      return `${base} bg-slate-100 text-slate-600`
    case 'not_applicable_justified':
      return `${base} bg-slate-200 text-slate-600`
    default:
      return `${base} bg-slate-100 text-slate-700`
  }
}

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Message d'erreur convivial à partir d'une exception API. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  return 'Une erreur est survenue. Vérifiez votre connexion puis réessayez.'
}

export type { Role }
