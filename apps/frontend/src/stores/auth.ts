import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import { sessionApi } from '@/lib/api'
import type { UserProfile } from '@/lib/supabase'

export interface AuthState {
  user: UserProfile | null
  session: string | null
  /** Permissions RBAC (V5 §3.3) — source de vérité : GET /api/v1/me */
  permissions: string[]
  isLoading: boolean
  setUser: (user: UserProfile | null) => void
  setSession: (token: string | null) => void
  setPermissions: (permissions: string[]) => void
  setLoading: (loading: boolean) => void
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  fetchProfile: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      session: null,
      permissions: [],
      isLoading: true,
      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      setPermissions: (permissions) => set({ permissions }),
      setLoading: (isLoading) => set({ isLoading }),
      signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) return { error: error.message }
        if (data.session) set({ session: data.session.access_token })
        await (get().fetchProfile as any)()
        return {}
      },
      signOut: async () => {
        // M9 : les saisies hors ligne en attente ne survivent pas à un changement de compte.
        try {
          const { clearOfflineQueue } = await import('@/lib/offline/db')
          await clearOfflineQueue()
        } catch { /* file indisponible (tests, navigation privée) : la déconnexion continue */ }
        await supabase.auth.signOut()
        set({ user: null, session: null, permissions: [] })
      },
      fetchProfile: async () => {
        const { data } = await supabase.auth.getUser()
        if (!data.user) { set({ user: null, permissions: [], isLoading: false }); return }
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', data.user.id)
          .single()
        // Permissions RBAC : serveur = source de vérité (le rôle déclaré ne suffit pas)
        const me = await sessionApi.me().catch(() => null)
        set({
          user: {
            id: data.user.id,
            email: data.user.email,
            tenant_id: profile?.tenant_id,
            role: profile?.role,
            display_name: profile?.display_name,
          },
          permissions: me?.permissions ?? [],
          isLoading: false,
        })
      },
    }),
    {
      name: 'iso-auth-storage',
      storage: createJSONStorage(() => sessionStorage),
      // M10 : le jeton d'accès n'est PAS dupliqué dans sessionStorage — le client Supabase gère la session.
      partialize: (state) => ({ user: state.user }),
    }
  )
)

function get() {
  return useAuthStore.getState()
}
