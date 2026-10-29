import { ClipboardList, LayoutDashboard, ShieldAlert, Activity, Table2, LibraryBig, Users2, FileBarChart2, FileText, ClipboardCheck, CalendarCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Écrans du menu — source unique : entrées de la barre latérale, titres d'en-tête et
 * écrans du guide « Que faire ici ? » (identifiants GUIDE_SCREENS du backend).
 * Ajouter un écran ici suffit pour qu'il ait son entrée, son titre et son guide.
 */
export interface NavItem {
  path: string
  label: string
  /** Titre affiché dans l'en-tête de la page */
  title: string
  /** Écran du guide contextuel (GET /guide?screen=) */
  screen: string
  icon: LucideIcon
  /** Permission requise pour voir l'entrée (RBAC V5 §3.3) — absent = tous rôles */
  perm?: string
  /** Visible si l'utilisateur détient AU MOINS UNE de ces permissions (ex. audits : gestion OU réponse) */
  anyPerm?: string[]
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Tableau de bord', title: 'Tableau de bord', screen: 'dashboard', icon: LayoutDashboard },
  { path: '/workflow', label: 'Mes actions', title: 'Mes actions', screen: 'workflow', icon: ClipboardList },
  { path: '/nc', label: 'Non-conformités', title: 'Non-conformités', screen: 'nc', icon: ShieldAlert },
  { path: '/audit', label: 'Prêt audit', title: 'Prêt audit', screen: 'audit', icon: Activity, perm: 'audit.export' },
  { path: '/matrice', label: 'Matrice ISO', title: 'Matrice de traçabilité', screen: 'matrice', icon: Table2 },
  { path: '/workflows', label: 'Bibliothèque WF', title: 'Bibliothèque de workflows', screen: 'workflows', icon: LibraryBig, perm: 'workflow.read' },
  { path: '/users', label: 'Utilisateurs', title: 'Utilisateurs du tenant', screen: 'users', icon: Users2, perm: 'user.manage' },
  { path: '/reports', label: 'Rapports', title: 'Rapports & préparation d’audit', screen: 'reports', icon: FileBarChart2, perm: 'action.approve' },
  { path: '/documents', label: 'Documents', title: 'Documents contrôlés', screen: 'documents', icon: FileText, perm: 'document.read' },
  { path: '/audits', label: 'Audits internes', title: 'Audits internes', screen: 'audits', icon: ClipboardCheck, anyPerm: ['internal_audit.manage', 'internal_audit.respond'] },
  { path: '/reviews', label: 'Revues direction', title: 'Revues de direction', screen: 'reviews', icon: CalendarCheck, perm: 'management_review.manage' },
]

const byPath = (pathname: string) => NAV_ITEMS.find((i) => i.path === pathname.replace(/\/$/, ''))

/** Écran du guide pour le chemin courant (null = pas de guide, ex. /login). /workflow/:id = page d'une action. */
export function screenForPath(pathname: string): { screen: string; actionId: string | null } | null {
  const m = pathname.match(/^\/workflow\/([^/]+)/)
  if (m) return { screen: 'action', actionId: m[1] ?? null }
  const item = byPath(pathname)
  return item ? { screen: item.screen, actionId: null } : null
}

/** Titre de l'en-tête pour le chemin courant. */
export function pageTitle(pathname: string): string {
  if (pathname.startsWith('/workflow/')) return 'Mes actions'
  return byPath(pathname)?.title ?? 'QualiDji'
}
