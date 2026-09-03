import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckSquare, AlertTriangle, FileText, TrendingUp, Bell, ShieldAlert, Clock } from 'lucide-react'
import Link from 'next/link'

export default async function TenantDashboardPage({
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

  let pendingTasks = 0
  let overdueTasks = 0
  let submittedTasks = 0
  let unreadNotifications = 0
  let unresolvedAnomalies = 0
  let expiringThisMonth = 0
  let complianceScore: number | null = null
  let recentAnomalies: Array<{ id: string; type: string; severity: string; created_at: string }> = []

  if (membership) {
    const isManager = ['tenant_admin', 'quality_manager', 'director', 'process_owner', 'super_admin'].includes(
      membership.role,
    )

    // Task counts
    let taskQuery = supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', membership.tenant_id)

    if (!isManager) {
      taskQuery = taskQuery.eq('assigned_to', user?.id)
    }

    const { count: p } = await taskQuery.in('status', ['pending', 'in_progress'])
    pendingTasks = p || 0

    const { count: o } = await taskQuery.in('status', ['overdue'])
    overdueTasks = o || 0

    const { count: s } = await taskQuery.in('status', ['submitted'])
    submittedTasks = s || 0

    // Unread notifications
    const { count: n } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user?.id)
      .eq('is_read', false)
    unreadNotifications = n || 0

    // Unresolved anomalies (managers only)
    if (isManager) {
      const { count: a } = await supabase
        .from('anomaly_flags')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', membership.tenant_id)
        .eq('is_resolved', false)
      unresolvedAnomalies = a || 0

      const { data: recentA } = await supabase
        .from('anomaly_flags')
        .select('id, type, severity, created_at')
        .eq('tenant_id', membership.tenant_id)
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(5)
      if (recentA) recentAnomalies = recentA
    }

    // Expiring this month
    const now = new Date()
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const { count: e } = await supabase
      .from('expiry_tracking')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', membership.tenant_id)
      .eq('is_active', true)
      .lte('expires_at', endOfMonth.toISOString().split('T')[0])
    expiringThisMonth = e || 0

    // Compliance score
    const { data: compliance } = await supabase.rpc('compute_compliance_summary', {
      p_tenant_id: membership.tenant_id,
      p_standard_id: '90000000-0000-0000-0000-000000000001',
    })
    if (compliance && compliance.length > 0) {
      complianceScore = Math.round(
        compliance.reduce((sum: number, c: { avg_score: number }) => sum + c.avg_score, 0) /
          compliance.length,
      )
    }
  }

  return (
    <DashboardContent
      pendingTasks={pendingTasks}
      overdueTasks={overdueTasks}
      submittedTasks={submittedTasks}
      unreadNotifications={unreadNotifications}
      unresolvedAnomalies={unresolvedAnomalies}
      expiringThisMonth={expiringThisMonth}
      complianceScore={complianceScore}
      recentAnomalies={recentAnomalies}
      locale={locale}
    />
  )
}

function DashboardContent({
  pendingTasks,
  overdueTasks,
  submittedTasks,
  unreadNotifications,
  unresolvedAnomalies,
  expiringThisMonth,
  complianceScore,
  recentAnomalies,
  locale,
}: {
  pendingTasks: number
  overdueTasks: number
  submittedTasks: number
  unreadNotifications: number
  unresolvedAnomalies: number
  expiringThisMonth: number
  complianceScore: number | null
  recentAnomalies: Array<{ id: string; type: string; severity: string; created_at: string }>
  locale: string
}) {
  const t = useTranslations('Dashboard')
  const tAdv = useTranslations('AdvancedDashboard')
  const tAnom = useTranslations('Anomalies')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('pendingTasks')}
          value={pendingTasks}
          description={t('pendingTasksDesc')}
          icon={CheckSquare}
          href={`/${locale}/tenant/tasks`}
        />
        <StatCard
          title={t('overdueTasks')}
          value={overdueTasks}
          description={t('overdueTasksDesc')}
          icon={AlertTriangle}
          variant={overdueTasks ? 'warning' : 'default'}
          href={`/${locale}/tenant/tasks`}
        />
        <StatCard
          title={tAdv('pendingVerifications')}
          value={submittedTasks}
          description={tAdv('last7Days')}
          icon={FileText}
          href={`/${locale}/tenant/tasks`}
        />
        <StatCard
          title={t('complianceIndex')}
          value={complianceScore !== null ? `${complianceScore}%` : '—'}
          description={t('complianceIndexDesc')}
          icon={TrendingUp}
          href={`/${locale}/tenant/compliance`}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title={t('activeDocs')}
          value={unreadNotifications}
          description={t('activeDocsDesc')}
          icon={Bell}
          href={`/${locale}/tenant/notifications`}
        />
        <StatCard
          title={tAdv('anomalyRate')}
          value={unresolvedAnomalies}
          description={tAdv('last30Days')}
          icon={ShieldAlert}
          variant={unresolvedAnomalies ? 'warning' : 'default'}
          href={`/${locale}/tenant/anomalies`}
        />
        <StatCard
          title={tAdv('expiringThisMonth')}
          value={expiringThisMonth}
          description={tAdv('thisMonth')}
          icon={Clock}
          variant={expiringThisMonth ? 'warning' : 'default'}
          href={`/${locale}/tenant/expirations`}
        />
      </div>

      {/* Compliance score gauge */}
      {complianceScore !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              {t('complianceIndex')}
            </CardTitle>
            <CardDescription>{t('complianceIndexDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="relative flex h-32 w-32 items-center justify-center">
                <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="10"
                    strokeDasharray={`${(complianceScore / 100) * 327} 327`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute text-3xl font-bold">{complianceScore}%</span>
              </div>
              <div className="flex-1">
                <Link href={`/${locale}/tenant/compliance`}>
                  <span className="text-sm font-medium text-primary hover:underline">
                    {tAdv('viewDetails')} →
                  </span>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent anomalies */}
      {recentAnomalies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              {tAnom('title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentAnomalies.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle
                    className={`h-4 w-4 ${a.severity === 'high' ? 'text-destructive' : 'text-warning'}`}
                  />
                  <div>
                    <p className="text-sm font-medium">{tAnom(`types.${a.type}` as never)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Badge variant={a.severity === 'high' ? 'destructive' : 'default'}>
                  {tAnom(`severityLevels.${a.severity}` as never)}
                </Badge>
              </div>
            ))}
            <Link href={`/${locale}/tenant/anomalies`}>
              <span className="text-sm font-medium text-primary hover:underline">
                {tAdv('viewDetails')} →
              </span>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  variant = 'default',
  href,
}: {
  title: string
  value: number | string
  description: string
  icon: React.ComponentType<{ className?: string }>
  variant?: 'default' | 'warning'
  href?: string
}) {
  const content = (
    <Card className="cursor-pointer transition-colors hover:bg-accent">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p
              className={`text-3xl font-bold ${
                variant === 'warning' && typeof value === 'number' && value > 0 ? 'text-warning' : ''
              }`}
            >
              {value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <div
            className={`rounded-md p-3 ${
              variant === 'warning' && typeof value === 'number' && value > 0 ? 'bg-warning/10' : 'bg-primary/10'
            }`}
          >
            <Icon
              className={`h-6 w-6 ${
                variant === 'warning' && typeof value === 'number' && value > 0 ? 'text-warning' : 'text-primary'
              }`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return href ? <Link href={href}>{content}</Link> : content
}
