import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BookOpen, Plus, CheckCircle2, Clock, GraduationCap } from 'lucide-react'
import Link from 'next/link'

export default async function TrainingPage({
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

  let trainings: Array<{
    id: string
    title: string
    code: string
    method: string | null
    is_mandatory: boolean
    duration_hours: number | null
  }> = []

  let sessions: any[] = []

  let myAttendance: any[] = []

  if (membership) {
    const { data } = await supabase
      .from('trainings')
      .select('id, title, code, method, is_mandatory, duration_hours')
      .eq('tenant_id', membership.tenant_id)
      .order('title', { ascending: true })
    if (data) trainings = data

    const { data: sessData } = await supabase
      .from('training_sessions')
      .select('id, training_id, scheduled_date, status, location, trainings(title, code)')
      .eq('tenant_id', membership.tenant_id)
      .order('scheduled_date', { ascending: false })
      .limit(20)
    if (sessData) sessions = sessData

    const { data: myAtt } = await supabase
      .from('training_attendance')
      .select('id, status, score, passed, training_sessions(scheduled_date, trainings(title, code))')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false })
      .limit(10)
    if (myAtt) myAttendance = myAtt
  }

  const canManage = ['tenant_admin', 'quality_manager', 'super_admin'].includes(
    membership?.role || '',
  )

  return (
    <TrainingContent
      trainings={trainings}
      sessions={sessions}
      myAttendance={myAttendance}
      canManage={canManage}
    />
  )
}

function TrainingContent({
  trainings,
  sessions,
  myAttendance,
  canManage,
}: {
  trainings: Array<{
    id: string
    title: string
    code: string
    method: string | null
    is_mandatory: boolean
    duration_hours: number | null
  }>
  sessions: any[]
  myAttendance: any[]
  canManage: boolean
}) {
  const t = useTranslations('Training')

  const sessionStatusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    planned: 'outline',
    scheduled: 'default',
    in_progress: 'default',
    completed: 'default',
    cancelled: 'destructive',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        {canManage && (
          <Button>
            <Plus className="me-2 h-4 w-4" />
            {t('createTraining')}
          </Button>
        )}
      </div>

      {/* My attendance */}
      {myAttendance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              {t('myTrainings')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myAttendance.map((att) => (
              <div key={att.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">
                    {att.training_sessions?.trainings?.code} — {att.training_sessions?.trainings?.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {att.training_sessions?.scheduled_date &&
                      new Date(att.training_sessions.scheduled_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {att.score !== null && (
                    <span className="text-sm font-medium">{att.score}%</span>
                  )}
                  {att.passed === true && <CheckCircle2 className="h-4 w-4 text-success" />}
                  <Badge variant={att.status === 'attended' ? 'default' : 'outline'}>
                    {t(`attendanceStatus.${att.status}` as never)}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Upcoming sessions */}
      {sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t('upcomingSessions')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">
                    {s.trainings?.code} — {s.trainings?.title}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(s.scheduled_date).toLocaleDateString()}
                    </span>
                    {s.location && <span>{s.location}</span>}
                  </div>
                </div>
                <Badge variant={sessionStatusVariant[s.status] || 'outline'}>
                  {t(`sessionStatus.${s.status}` as never)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* All trainings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {t('allTrainings')} ({trainings.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {trainings.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noTrainings')}</p>
          )}
          {trainings.map((tr) => (
            <div key={tr.id} className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-start gap-3">
                <BookOpen className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{tr.code}</span>
                    {tr.is_mandatory && (
                      <Badge variant="destructive">{t('mandatory')}</Badge>
                    )}
                    {tr.method && (
                      <Badge variant="outline">
                        {t(`method.${tr.method}` as never)}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 font-medium">{tr.title}</p>
                  {tr.duration_hours && (
                    <p className="text-xs text-muted-foreground">
                      {tr.duration_hours}h
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
