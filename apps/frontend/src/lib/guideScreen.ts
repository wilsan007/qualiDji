/** Écran du menu correspondant au chemin courant (null = pas de guide, ex. /login). */
export function screenForPath(pathname: string): { screen: string; actionId: string | null } | null {
  const m = pathname.match(/^\/workflow\/([^/]+)/)
  if (m) return { screen: 'action', actionId: m[1] ?? null }
  const map: Record<string, string> = {
    '/dashboard': 'dashboard', '/workflow': 'workflow', '/nc': 'nc', '/audit': 'audit', '/matrice': 'matrice',
    '/workflows': 'workflows', '/users': 'users', '/reports': 'reports', '/documents': 'documents', '/audits': 'audits', '/reviews': 'reviews',
  }
  const screen = map[pathname.replace(/\/$/, '')]
  return screen ? { screen, actionId: null } : null
}
