import { useEffect, useState } from 'react'
import { ClipboardList, LayoutDashboard, LogOut, ShieldAlert, Activity, Menu, X, Bell, Table2, LibraryBig, Users2 } from 'lucide-react'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { usePermissions } from '@/hooks/usePermissions'
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
            <button
              className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
            </button>
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