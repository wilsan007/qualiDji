import React, { ReactNode, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
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
          <Route path="audit" element={<RequireAuth><AuditReadiness /></RequireAuth>} />
          <Route path="matrice" element={<RequireAuth><Traceability /></RequireAuth>} />
          <Route path="workflows" element={<RequireAuth><Workflows /></RequireAuth>} />
          <Route path="users" element={<RequireAuth><Users /></RequireAuth>} />
          <Route path="reports" element={<RequireAuth><Reports /></RequireAuth>} />
          <Route path="documents" element={<RequireAuth><Documents /></RequireAuth>} />
          {/* Toute route inconnue → tableau de bord (plus de pages blanches) */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
