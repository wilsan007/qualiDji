import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { CheckSquare, Clock, AlertTriangle, Circle } from 'lucide-react'

export default async function TasksPage({
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

  let tasks: Array<{
    id: string
    title: string
    status: string
    priority: string
    due_date: string
    assigned_to: string | null
    evidence_level_min: string
  }> = []

  if (membership) {
    const isManager = ['tenant_admin', 'quality_manager', 'director', 'process_owner', 'super_admin'].includes(
      membership.role,
    )

    let query = supabase
      .from('tasks')
      .select('id, title, status, priority, due_date, assigned_to, evidence_level_min')
      .eq('tenant_id', membership.tenant_id)
      .order('due_date', { ascending: true })

    if (!isManager) {
      query = query.eq('assigned_to', user?.id)
    }

    const { data } = await query.limit(50)
    if (data) tasks = data
  }

  return <TasksContent tasks={tasks} locale={locale} />
}

function TasksContent({
  tasks,
  locale,
}: {
  tasks: Array<{
    id: string
    title: string
    status: string
    priority: string
    due_date: string
    assigned_to: string | null
    evidence_level_min: string
  }>
  locale: string
}) {
  const t = useTranslations('Tasks')

  const statusConfig: Record<string, { icon: typeof CheckSquare; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { icon: Circle, variant: 'secondary' },
    in_progress: { icon: Clock, variant: 'default' },
    submitted: { icon: CheckSquare, variant: 'outline' },
    verified: { icon: CheckSquare, variant: 'default' },
    rejected: { icon: AlertTriangle, variant: 'destructive' },
    overdue: { icon: AlertTriangle, variant: 'destructive' },
  }

  const statusLabel: Record<string, string> = {
    pending: t('pending'),
    in_progress: t('inProgress'),
    submitted: t('submitted'),
    verified: t('verified'),
    rejected: t('rejected'),
    overdue: t('overdue'),
  }

  const priorityLabel: Record<string, string> = {
    low: t('low'),
    medium: t('medium'),
    high: t('high'),
    critical: t('critical'),
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CheckSquare className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">{t('noTasks')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const StatusIcon = statusConfig[task.status]?.icon || Circle
            const isOverdue = task.status === 'overdue' || (task.status === 'pending' && new Date(task.due_date) < new Date())

            return (
              <Link key={task.id} href={`/${locale}/tenant/tasks/${task.id}`}>
                <Card className="cursor-pointer transition-colors hover:bg-accent">
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      <StatusIcon className={`h-5 w-5 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`} />
                      <div>
                        <p className="font-medium">{task.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {t('dueDate')}: {new Date(task.due_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusConfig[task.status]?.variant || 'secondary'}>
                        {statusLabel[task.status] || task.status}
                      </Badge>
                      <Badge variant="outline">{priorityLabel[task.priority] || task.priority}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
