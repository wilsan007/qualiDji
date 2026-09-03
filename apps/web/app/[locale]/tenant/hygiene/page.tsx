import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sparkles, Plus, CheckCircle2, Clock, Bug, ShieldAlert } from 'lucide-react'

export default async function HygienePage({
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

  let cleaningPlans: any[] = []
  let cleaningTasks: any[] = []
  let pestRecords: any[] = []

  if (membership) {
    const { data } = await supabase
      .from('cleaning_plans')
      .select('id, name, code, area, equipment, frequency, method, is_active')
      .eq('tenant_id', membership.tenant_id)
      .eq('is_active', true)
      .order('code')
    if (data) cleaningPlans = data

    const { data: tasks } = await supabase
      .from('cleaning_tasks')
      .select('id, scheduled_date, completed_at, status, cleaning_plan_id, cleaning_plans(name, code, area)')
      .eq('tenant_id', membership.tenant_id)
      .order('scheduled_date', { ascending: false })
      .limit(30)
    if (tasks) cleaningTasks = tasks

    const { data: pests } = await supabase
      .from('pest_control_records')
      .select('id, type, conducted_date, findings, action_taken, follow_up_required, follow_up_date')
      .eq('tenant_id', membership.tenant_id)
      .order('conducted_date', { ascending: false })
      .limit(10)
    if (pests) pestRecords = pests
  }

  const canManage = ['tenant_admin', 'quality_manager', 'super_admin'].includes(
    membership?.role || '',
  )

  return (
    <HygieneContent
      cleaningPlans={cleaningPlans}
      cleaningTasks={cleaningTasks}
      pestRecords={pestRecords}
      canManage={canManage}
    />
  )
}

function HygieneContent({
  cleaningPlans,
  cleaningTasks,
  pestRecords,
  canManage,
}: {
  cleaningPlans: any[]
  cleaningTasks: any[]
  pestRecords: any[]
  canManage: boolean
}) {
  const t = useTranslations('Hygiene')

  const taskStatusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending: 'outline',
    in_progress: 'default',
    completed: 'default',
    verified: 'default',
    overdue: 'destructive',
  }

  const today = new Date().toISOString().split('T')[0]
  const overdueTasks = cleaningTasks.filter(
    (t) => t.status === 'overdue' || (t.status === 'pending' && t.scheduled_date < today),
  ).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="h-6 w-6 text-primary" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        {canManage && (
          <Button>
            <Plus className="me-2 h-4 w-4" />
            {t('createPlan')}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('cleaningPlans')}</p>
            <p className="text-2xl font-bold">{cleaningPlans.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('recentTasks')}</p>
            <p className="text-2xl font-bold">{cleaningTasks.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('overdueTasks')}</p>
            <p className="text-2xl font-bold text-destructive">{overdueTasks}</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent cleaning tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            {t('recentCleaningTasks')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {cleaningTasks.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noTasks')}</p>
          )}
          {cleaningTasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-start gap-3">
                <Clock className="mt-1 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    {task.cleaning_plans?.code} — {task.cleaning_plans?.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {task.cleaning_plans?.area} · {new Date(task.scheduled_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Badge variant={taskStatusVariant[task.status] || 'outline'}>
                {t(`taskStatus.${task.status}` as never)}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Cleaning plans */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {t('cleaningPlansList')} ({cleaningPlans.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {cleaningPlans.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noPlans')}</p>
          )}
          {cleaningPlans.map((plan) => (
            <div key={plan.id} className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{plan.code}</span>
                <Badge variant="outline">
                  {t(`frequency.${plan.frequency}` as never)}
                </Badge>
              </div>
              <p className="mt-1 font-medium">{plan.name}</p>
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                {plan.area && <span>{plan.area}</span>}
                {plan.equipment && <span>· {plan.equipment}</span>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{plan.method}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Pest control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            {t('pestControl')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {pestRecords.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noPestRecords')}</p>
          )}
          {pestRecords.map((pr) => (
            <div key={pr.id} className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-start gap-3">
                <Bug className="mt-1 h-4 w-4 text-muted-foreground" />
                <div>
                  <Badge variant="outline" className="mb-1">
                    {t(`pestType.${pr.type}` as never)}
                  </Badge>
                  <p className="text-sm">{pr.findings || t('noFindings')}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(pr.conducted_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {pr.follow_up_required && (
                <Badge variant="outline" className="text-warning">
                  <ShieldAlert className="me-1 h-3 w-3" />
                  {t('followUpRequired')}
                </Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
