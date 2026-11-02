import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/Button'
import { passwordIssue, MIN_PASSWORD_LENGTH } from '@/lib/password'
import { ShieldCheck, Lock, KeyRound } from 'lucide-react'

/**
 * Choix du mot de passe : atterrissage du lien d'invitation (premier accès) ou du lien
 * « Mot de passe oublié ». GoTrue ouvre une session à partir du fragment d'URL ; sans cette
 * session le lien est invalide ou expiré (usage unique).
 */
export default function SetPassword() {
  const navigate = useNavigate()
  const fetchProfile = useAuthStore((s) => s.fetchProfile)
  const [ready, setReady] = useState<'checking' | 'ok' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    // Le client Supabase échange le fragment d'URL contre une session de façon asynchrone.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive && session) setReady('ok')
    })
    supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) setReady('ok')
    })
    const timer = window.setTimeout(() => {
      if (alive) setReady((r) => (r === 'checking' ? 'invalid' : r))
    }, 4000)
    return () => {
      alive = false
      sub.subscription.unsubscribe()
      window.clearTimeout(timer)
    }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const issue = passwordIssue(password, confirmation)
    if (issue) {
      setError(issue)
      return
    }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      setSaving(false)
      setError(err.message)
      return
    }
    await fetchProfile()
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">QualiDji</h1>
          <p className="text-slate-500 text-sm mt-2">Choisissez votre mot de passe</p>
        </div>

        <div className="card p-8">
          {ready === 'checking' && <p className="text-sm text-slate-500 text-center">Vérification du lien…</p>}

          {ready === 'invalid' && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-slate-700">
                Ce lien est invalide ou a expiré (un lien ne sert qu'une fois).
              </p>
              <p className="text-xs text-slate-500">
                Depuis la page de connexion, utilisez « Mot de passe oublié ? » pour recevoir un nouveau lien, ou demandez une nouvelle invitation à votre administrateur.
              </p>
              <Link to="/login" className="inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
                Retour à la connexion
              </Link>
            </div>
          )}

          {ready === 'ok' && (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="label" htmlFor="new-password">Nouveau mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    id="new-password"
                    className="input pl-10"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">Au moins {MIN_PASSWORD_LENGTH} caractères.</p>
              </div>
              <div>
                <label className="label" htmlFor="confirm-password">Confirmer le mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    id="confirm-password"
                    className="input pl-10"
                    type="password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <Button type="submit" loading={saving} className="w-full">
                <KeyRound className="w-4 h-4 mr-2" /> Enregistrer et accéder à mon espace
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
