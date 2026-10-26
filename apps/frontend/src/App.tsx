import React, { ReactNode, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { usePermissions } from '@/hooks/usePermissions'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import { installOfflineSync } from '@/lib/offline/db'
import WorkflowExecution from '@/pages/WorkflowExecution'
import NonConformities from '@/pages/NonConformities'
import AuditReadiness from '@/pages/AuditReadiness'
import Traceability from '@/pages/Traceability'
import Workflows from '@/pages/Workflows'
import Users from '@/pages/Users'
import Reports from '@/pages/Reports'
import Documents from '@/pages/Documents'
import Audits from '@/pages/Audits'
import Reviews from '@/pages/Reviews'
import Layout from '@/components/Layout'

/** Écran de démarrage pendant la restauration de session (évite l'écran blanc). */
function BootSplash() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-500">Chargement de votre espace…</p>
      </div>
    </div>
  )
}

const RequireAuth: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuthStore()
  if (isLoading) return <BootSplash />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** M10 : garde de route par permission — l'URL directe d'une page interdite renvoie au tableau de bord (le serveur reste l'autorité). */
const RequirePermission: React.FC<{ any: string[]; children: ReactNode }> = ({ any, children }) => {
  const { user, isLoading } = useAuthStore()
  const { hasAny } = usePermissions()
  if (isLoading) return <BootSplash />
  if (!user) return <Navigate to="/login" replace />
  if (!hasAny(...any)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

/** Redirige vers le tableau de bord si déjà connecté (sans navigate() pendant le render). */
const RequireGuest: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuthStore()
  if (isLoading) return <BootSplash />
  if (user) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  const fetchProfile = useAuthStore((s) => s.fetchProfile)

  useEffect(() => {
    fetchProfile()
    // §13 : replay automatique de la file hors ligne au retour du réseau
    installOfflineSync()
  }, [fetchProfile])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<RequireGuest><Login /></RequireGuest>} />
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="workflow" element={<RequireAuth><WorkflowExecution /></RequireAuth>} />
          <Route path="workflow/:actionId" element={<RequireAuth><WorkflowExecution /></RequireAuth>} />
          <Route path="nc" element={<RequireAuth><NonConformities /></RequireAuth>} />
          <Route path="audit" element={<RequirePermission any={['audit.export']}><AuditReadiness /></RequirePermission>} />
          <Route path="matrice" element={<RequireAuth><Traceability /></RequireAuth>} />
          <Route path="workflows" element={<RequirePermission any={['workflow.read']}><Workflows /></RequirePermission>} />
          <Route path="users" element={<RequirePermission any={['user.manage']}><Users /></RequirePermission>} />
          <Route path="reports" element={<RequirePermission any={['action.approve']}><Reports /></RequirePermission>} />
          <Route path="documents" element={<RequirePermission any={['document.read']}><Documents /></RequirePermission>} />
          <Route path="audits" element={<RequirePermission any={['internal_audit.manage', 'internal_audit.respond']}><Audits /></RequirePermission>} />
          <Route path="reviews" element={<RequirePermission any={['management_review.manage']}><Reviews /></RequirePermission>} />
          {/* Toute route inconnue → tableau de bord (plus de pages blanches) */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
