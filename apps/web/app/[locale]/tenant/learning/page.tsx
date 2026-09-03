import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BookOpen, PlayCircle, CheckCircle2, Clock, GraduationCap, Award } from 'lucide-react'

export default async function LearningPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('memberships')
    .select('tenant_id, role')
    .eq('user_id', user?.id)
    .single()

  let capsules: any[] = []
  const myCompletions: Record<string, any> = {}
  let proficiency: any = null

  if (membership) {
    const { data } = await supabase
      .from('learning_capsules')
      .select('id, title, title_en, title_ar, title_so, description, type, lang, duration_minutes, is_mandatory, target_level')
      .eq('is_active', true)
      .or(`tenant_id.is.null,tenant_id.eq.${membership.tenant_id}`)
      .order('is_mandatory', { ascending: false })
      .order('title', { ascending: true })
    if (data) capsules = data

    const { data: completions } = await supabase
      .from('capsule_completions')
      .select('id, capsule_id, completed_at, score, passed')
      .eq('user_id', user?.id)
    if (completions) {
      for (const c of completions) {
        myCompletions[c.capsule_id] = c
      }
    }

    const { data: prof } = await supabase
      .from('user_proficiency')
      .select('*')
      .eq('user_id', user?.id)
      .maybeSingle()
    if (prof) proficiency = prof
  }

  return (
    <LearningContent
      capsules={capsules}
      myCompletions={myCompletions}
      proficiency={proficiency}
    />
  )
}

function LearningContent({
  capsules,
  myCompletions,
  proficiency,
}: {
  capsules: any[]
  myCompletions: Record<string, any>
  proficiency: any
}) {
  const t = useTranslations('Learning')

  const levelColor: Record<string, string> = {
    novice: 'text-muted-foreground',
    intermediate: 'text-warning',
    confirmed: 'text-primary',
    expert: 'text-success',
  }

  const typeIcon: Record<string, any> = {
    video: PlayCircle,
    audio: PlayCircle,
    interactive: BookOpen,
    text: BookOpen,
    quiz: Award,
  }

  const completedCount = Object.keys(myCompletions).length
  const mandatoryCount = capsules.filter((c) => c.is_mandatory).length
  const mandatoryCompleted = capsules.filter(
    (c) => c.is_mandatory && myCompletions[c.id]?.completed_at,
  ).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Proficiency card */}
      {proficiency && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <GraduationCap className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('yourLevel')}</p>
                  <p className={`text-xl font-bold ${levelColor[proficiency.level] || ''}`}>
                    {t(`level.${proficiency.level}` as never)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('mode')}: {t(`mode.${proficiency.ui_mode}` as never)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{proficiency.capsules_completed}</p>
                  <p className="text-xs text-muted-foreground">{t('capsulesCompleted')}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{proficiency.tasks_completed}</p>
                  <p className="text-xs text-muted-foreground">{t('tasksCompleted')}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{Math.round(proficiency.quiz_average_score)}%</p>
                  <p className="text-xs text-muted-foreground">{t('avgScore')}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('completed')}</p>
            <p className="text-2xl font-bold text-success">{completedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('mandatoryDone')}</p>
            <p className="text-2xl font-bold">{mandatoryCompleted}/{mandatoryCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('totalCapsules')}</p>
            <p className="text-2xl font-bold">{capsules.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Capsules list */}
      <div className="space-y-3">
        {capsules.map((cap) => {
          const completion = myCompletions[cap.id]
          const isCompleted = completion?.completed_at
          const Icon = typeIcon[cap.type] || BookOpen
          return (
            <Card key={cap.id} className={isCompleted ? 'opacity-70' : ''}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{cap.title}</p>
                      {cap.is_mandatory && (
                        <Badge variant="destructive">{t('mandatory')}</Badge>
                      )}
                      <Badge variant="outline">
                        {t(`type.${cap.type}` as never)}
                      </Badge>
                    </div>
                    {cap.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{cap.description}</p>
                    )}
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {cap.duration_minutes} {t('minutes')}
                      </span>
                      <span>{t(`targetLevel.${cap.target_level}` as never)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isCompleted && (
                    <div className="flex items-center gap-2">
                      {completion.score !== null && (
                        <span className="text-sm font-medium">{completion.score}%</span>
                      )}
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    </div>
                  )}
                  {!isCompleted && (
                    <Button size="sm">
                      <PlayCircle className="me-2 h-4 w-4" />
                      {t('start')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
