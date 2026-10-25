import { useState } from 'react'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/Button'
import { ShieldCheck, Mail, Lock, LogIn } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const signIn = useAuthStore((s) => s.signIn)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await signIn(email, password)
    setLoading(false)
    if (err) setError(err)
  }

  const fillDemo = () => {
    setEmail('test@qualidji.fr')
    setPassword('TestPass123')
    setError('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-200/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 w-[420px] h-[420px] rounded-full bg-indigo-200/40 blur-3xl" />

      <div className="w-full max-w-md relative animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">QualiDji</h1>
          <p className="text-slate-500 text-sm mt-2">Assistant Terrain ISO 9001 — Connexion</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label" htmlFor="login-email">Email professionnel</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  id="login-email"
                  className="input pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="prenom.nom@entreprise.fr"
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="login-password">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  id="login-password"
                  className="input pl-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full">
              <LogIn className="w-4 h-4 mr-2" /> Se connecter
            </Button>
          </form>

          <div className="mt-6 p-3 bg-slate-50 rounded-lg text-xs text-slate-500 space-y-1.5 border border-slate-100">
            <p className="font-medium text-slate-600">Compte de démonstration</p>
            <p>test@qualidji.fr — TestPass123</p>
            <button
              type="button"
              onClick={fillDemo}
              className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              Remplir automatiquement →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
