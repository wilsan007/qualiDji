import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, LayoutDashboard, LogOut, ShieldAlert, Activity, Menu, X, Bell, Table2, LibraryBig, Users2 } from 'lucide-react'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { usePermissions } from '@/hooks/usePermissions'
import { notificationsApi, NotificationItem } from '@/lib/api'
import { roleLabel, spaceForRole } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  /** Permission requise pour voir l'entrée (RBAC V5 §3.3) — absent = tous rôles */
  perm?: string
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { path: '/workflow', label: 'Mes actions', icon: ClipboardList },
  { path: '/nc', label: 'Non-conformités', icon: ShieldAlert },
  { path: '/audit', label: 'Prêt audit', icon: Activity, perm: 'audit.export' },
  { path: '/matrice', label: 'Matrice ISO', icon: Table2 },
  { path: '/workflows', label: 'Bibliothèque WF', icon: LibraryBig, perm: 'workflow.read' },
  { path: '/users', label: 'Utilisateurs', icon: Users2, perm: 'user.manage' },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { signOut } = useAuthStore()
  const { has } = usePermissions()
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <>
      <div className="p-5 flex items-center gap-2.5">
        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm shadow-blue-900/40">
          <ClipboardList className="w-5 h-5 text-white" />
        </div>
        <div className="leading-tight">
          <span className="font-bold text-lg tracking-tight text-white block">QualiDji</span>
          <span className="text-[11px] text-slate-400">Assistant ISO 9001</span>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.filter((item) => !item.perm || has(item.perm)).map((item) => {
          const Icon = item.icon
          const isActive =
            location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <button
          onClick={() => signOut().then(() => navigate('/login'))}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut className="w-5 h-5" /> Déconnexion
        </button>
      </div>
    </>
  )
}

function pageTitle(pathname: string): string {
  if (pathname === '/dashboard') return 'Tableau de bord'
  if (pathname === '/workflow' || pathname.startsWith('/workflow/')) return 'Mes actions'
  if (pathname === '/nc') return 'Non-conformités'
  if (pathname === '/audit') return 'Prêt audit'
  if (pathname === '/matrice') return 'Matrice de traçabilité'
  if (pathname === '/workflows') return 'Bibliothèque de workflows'
  if (pathname === '/users') return 'Utilisateurs du tenant'
  return 'QualiDji'
}

const NOTIF_KIND_LABELS: Record<string, string> = {
  'action.assigned': 'Action assignée',
  'action.submitted': 'Action soumise',
  'action.blocked': 'Action bloquée',
  'nc.created': 'Non-conformité',
  'workflow.in_review': 'Approbation requise',
  'workflow.approved': 'Workflow publié',
  'workflow.rejected': 'Workflow rejeté',
}

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'à l’instant'
  const m = Math.floor(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.floor(h / 24)} j`
}

/** Cloche du header (V5 §5.7) : compte non-lues, panneau, lien profond, mark-read. */
function NotificationsBell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await notificationsApi.list()
      setItems(res.notifications ?? [])
      setUnread(res.unread_count ?? 0)
    } catch {
      /* silencieux : la cloche ne doit jamais casser le layout */
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(id)
  }, [refresh])

  // Re-fetch à chaque navigation (les événements de la page précédente ont pu notifier)
  useEffect(() => {
    void refresh()
  }, [location.pathname, refresh])

  const onItemClick = async (n: NotificationItem) => {
    if (!n.read_at) {
      try {
        await notificationsApi.markRead(n.id)
      } catch { /* best-effort */ }
    }
    setOpen(false)
    if (n.link) navigate(n.link)
    else void refresh()
  }

  const onMarkAll = async () => {
    try {
      await notificationsApi.markAllRead()
      await refresh()
    } catch { /* best-effort */ }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
        aria-label={`Notifications${unread ? ` (${unread} non lues)` : ''}`}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 sm:w-96 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-800">Notifications</span>
              {unread > 0 && (
                <button onClick={() => void onMarkAll()} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                  Tout marquer lu
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Aucune notification.</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => void onItemClick(n)}
                    className={cn(
                      'w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors',
                      !n.read_at && 'bg-blue-50/50'
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={cn('mt-1.5 w-2 h-2 rounded-full shrink-0', n.read_at ? 'bg-slate-200' : 'bg-blue-500')} />
                      <div className="min-w-0">
                        <p className={cn('text-xs', n.read_at ? 'text-slate-500' : 'text-slate-800 font-medium')}>
                          {NOTIF_KIND_LABELS[n.kind] ?? n.kind}
                        </p>
                        <p className="text-sm text-slate-700 truncate">{n.title}</p>
                        {n.body && <p className="text-xs text-slate-400 truncate">{n.body}</p>}
                        <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function Layout() {
  const { user } = useAuthStore()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Ferme le tiroir mobile à chaque changement de page
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const initials = (user?.display_name || user?.email || '?')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-64 bg-slate-900 flex-col shrink-0">
        <SidebarContent />
      </aside>

      {/* Tiroir mobile */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-slate-900 flex flex-col animate-slide-in-right shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Fermer le menu"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Contenu principal */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 shrink-0 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              onClick={() => setMobileOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="min-w-0">
              <h1 className="font-semibold text-slate-900 truncate">
                {pageTitle(location.pathname)}
              </h1>
              <p className="text-xs text-slate-500 truncate">
                {roleLabel(user?.role)}
                <span className="mx-1.5 text-slate-300">·</span>
                <span title={spaceForRole(user?.role).label}>
                  {spaceForRole(user?.role).short}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationsBell />
            <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-slate-900 truncate max-w-[180px]">
                  {user?.display_name || user?.email}
                </p>
                <p className="text-xs text-slate-500 truncate max-w-[180px]">{user?.email}</p>
              </div>
              <div
                className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold shrink-0"
                title={user?.email}
              >
                {initials}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="animate-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}