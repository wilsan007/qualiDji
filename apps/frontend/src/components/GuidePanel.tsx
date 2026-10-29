import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  AlertTriangle, BookOpen, CheckCircle2, ChevronDown, ChevronUp, Compass, Info, MessageCircleQuestion, RefreshCw, ShieldAlert,
} from 'lucide-react'
import { guideApi, GuideAnswer, GuideResponse, GuideStep, GUIDE_REFRESH_EVENT } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { screenForPath } from '@/lib/navigation'

const COLLAPSE_KEY = 'qualidji-guide-collapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function StepIcon({ step, index }: { step: GuideStep; index: number }) {
  if (step.status === 'done') return <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-label="fait" />
  if (step.status === 'info') return <Info className="w-5 h-5 text-slate-400 shrink-0" aria-label="repère" />
  return (
    <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0" aria-label="à faire">
      {index}
    </span>
  )
}

/**
 * « Que faire ici ? » — guide déterministe calculé par le serveur pour l'écran courant et le
 * rôle connecté (GET /guide), toujours disponible, sans IA. En dessous, la question libre
 * « Comment faire… ? » (POST /guide/ask) répond à partir de la notice et des documents publiés.
 */
export function GuidePanel() {
  const location = useLocation()
  const target = screenForPath(location.pathname)
  const screen = target?.screen ?? null
  const actionId = target?.actionId ?? null

  const [data, setData] = useState<GuideResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<GuideAnswer | null>(null)
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState('')

  // Une réponse n'est appliquée que si elle répond à la DERNIÈRE requête de l'écran affiché :
  // une requête lente d'un écran quitté (ou dépassée par une plus récente) est ignorée.
  const viewKey = `${screen}|${actionId ?? ''}`
  const viewRef = useRef(viewKey)
  viewRef.current = viewKey
  const lastGuideRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!screen) return
    const requestId = ++lastGuideRequest.current
    setLoading(true)
    try {
      const res = await guideApi.get(screen, actionId)
      if (requestId !== lastGuideRequest.current) return
      setData(res)
      setError('')
    } catch (e) {
      if (requestId !== lastGuideRequest.current) return
      setError(errorMessage(e))
    } finally {
      if (requestId === lastGuideRequest.current) setLoading(false)
    }
  }, [screen, actionId])

  // Nouvel écran : nouveau guide ; l'ancien guide, la réponse et la section ouvertes sont effacés
  useEffect(() => {
    setData(null)
    setError('')
    setAnswer(null)
    setAskError('')
    setAsking(false)
    setOpenSection(null)
    void refresh()
  }, [refresh])

  // Après chaque écriture réussie (soumission, validation, invitation…), le guide se recalcule
  useEffect(() => {
    let timer: number | undefined
    const onChange = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void refresh(), 400)
    }
    window.addEventListener(GUIDE_REFRESH_EVENT, onChange)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener(GUIDE_REFRESH_EVENT, onChange)
    }
  }, [refresh])

  const toggle = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch { /* préférence non mémorisée : sans conséquence */ }
      return !c
    })
  }

  const ask = async (e: FormEvent) => {
    e.preventDefault()
    if (!screen || question.trim().length < 3) return
    const askedOn = viewKey
    setAsking(true)
    setAskError('')
    try {
      const res = await guideApi.ask(screen, question.trim(), actionId)
      if (viewRef.current !== askedOn) return // l'utilisateur a changé d'écran : réponse hors sujet ici
      setAnswer(res)
    } catch (err) {
      if (viewRef.current !== askedOn) return
      setAnswer(null)
      setAskError(errorMessage(err))
    } finally {
      if (viewRef.current === askedOn) setAsking(false)
    }
  }

  if (!screen) return null

  const guide = data?.guide
  let todoIndex = 0

  return (
    <section className="mb-5 rounded-xl border border-sky-200 bg-sky-50/60" aria-label="Que faire ici ?">
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <button onClick={toggle} className="flex items-start gap-2.5 text-left min-w-0" aria-expanded={!collapsed}>
          <Compass className="w-5 h-5 text-sky-700 mt-0.5 shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-sky-900">
              Que faire ici ?{data?.role_label ? <span className="font-normal text-sky-700"> — {data.role_label}</span> : null}
            </span>
            {collapsed && guide && (
              <span className="block text-xs text-sky-800 truncate">
                {guide.next ? `Prochaine étape : ${guide.next.label}` : 'Rien en attente sur cet écran.'}
              </span>
            )}
          </span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => void refresh()}
            className="p-1.5 rounded-md text-sky-700 hover:bg-sky-100"
            aria-label="Actualiser le guide"
            title="Actualiser"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button onClick={toggle} className="p-1.5 rounded-md text-sky-700 hover:bg-sky-100" aria-label={collapsed ? 'Afficher le guide' : 'Masquer le guide'}>
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          {error && (
            <p className="text-xs text-red-600 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Guide indisponible : {error}
            </p>
          )}
          {!guide && !error && <p className="text-sm text-slate-500">Chargement du guide…</p>}

          {guide && (
            <>
              <p className="text-sm text-slate-600">{guide.purpose}</p>
              <ol className="space-y-2">
                {guide.steps.map((s) => {
                  if (s.status === 'todo') todoIndex += 1
                  const isNext = guide.next?.id === s.id
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        'flex items-start gap-2.5 rounded-lg px-3 py-2 bg-white border',
                        isNext ? 'border-amber-300 shadow-sm' : 'border-slate-200',
                      )}
                    >
                      <StepIcon step={s} index={todoIndex} />
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm', s.status === 'done' ? 'text-slate-500' : 'text-slate-900 font-medium')}>
                          {isNext && <span className="text-[11px] uppercase tracking-wide text-amber-700 font-semibold mr-1.5">Maintenant</span>}
                          {s.label}
                        </p>
                        {s.detail && s.status !== 'done' && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{s.detail}</p>}
                      </div>
                      {s.link && s.status !== 'done' && s.link !== location.pathname && (
                        <Link to={s.link} className="text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap mt-0.5">
                          Ouvrir →
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ol>

              {data.manual.length > 0 && (
                <div className="text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1 mr-1.5 font-medium"><BookOpen className="w-3.5 h-3.5" /> Notice :</span>
                  {data.manual.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setOpenSection((o) => (o === m.id ? null : m.id))}
                      className={cn('mr-2 underline-offset-2 hover:underline', openSection === m.id ? 'text-sky-800 font-semibold' : 'text-sky-700')}
                    >
                      §{m.id} {m.title}
                    </button>
                  ))}
                  {openSection && (
                    <p className="mt-2 bg-white border border-slate-200 rounded-lg p-3 text-slate-700 leading-relaxed">
                      {data.manual.find((m) => m.id === openSection)?.text}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <form onSubmit={ask} className="flex flex-col sm:flex-row gap-2 pt-1">
            <label className="sr-only" htmlFor="guide-question">Comment faire… ?</label>
            <input
              id="guide-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              placeholder="Comment faire… ? (ex. : comment joindre une preuve ?)"
              className="flex-1 min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
            <Button type="submit" size="sm" variant="outline" loading={asking} disabled={question.trim().length < 3}>
              <MessageCircleQuestion className="w-4 h-4 mr-1.5" /> Demander
            </Button>
          </form>
          <p className="text-[11px] text-slate-400 -mt-1">Ne saisissez aucune donnée personnelle (nom, e-mail, téléphone).</p>

          {askError && (
            <p className="text-xs text-red-600 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {askError}
            </p>
          )}

          {answer && (
            <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-2" aria-live="polite">
              {answer.degraded && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 flex items-start gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Réponse tirée de la notice d’utilisation (assistant IA non configuré ou indisponible).
                </p>
              )}
              <p className="text-sm text-slate-800">{answer.answer}</p>
              {answer.steps.length > 0 && (
                <ol className="list-decimal list-inside text-sm text-slate-700 space-y-1">
                  {answer.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              )}
              {answer.sources.length > 0 && (
                <p className="text-[11px] text-slate-400">Sources : {answer.sources.map((s) => s.title).join(' · ')}</p>
              )}
              {answer.warnings.filter((w) => !answer.degraded || !w.startsWith('Aucun fournisseur')).map((w, i) => (
                <p key={i} className="text-[11px] text-amber-700">{w}</p>
              ))}
              <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-1.5">
                Suggestion à vérifier : l’assistant explique, il n’exécute, ne valide et n’approuve rien.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
