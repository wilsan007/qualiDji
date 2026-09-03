import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Plus, CheckCircle2, Clock } from 'lucide-react'
import Link from 'next/link'

export default async function NonconformitiesPage({
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

  let nonconformities: Array<{
    id: string
    nc_number: string
    title: string
    severity: string
    status: string
    source: string
    detected_at: string
    due_date: string | null
  }> = []

  let stats = { open: 0, inProgress: 0, closed: 0, critical: 0 }

  if (membership) {
    const { data } = await supabase
      .from('nonconformities')
      .select('id, nc_number, title, severity, status, source, detected_at, due_date')
      .eq('tenant_id', membership.tenant_id)
      .order('detected_at', { ascending: false })
      .limit(100)
    if (data) nonconformities = data

    const { count: openCount } = await supabase
      .from('nonconformities')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', membership.tenant_id)
      .in('status', ['open', 'under_investigation'])

    const { count: inProgressCount } = await supabase
      .from('nonconformities')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', membership.tenant_id)
      .in('status', ['capa_defined', 'capa_in_progress'])

    const { count: closedCount } = await supabase
      .from('nonconformities')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', membership.tenant_id)
      .in('status', ['verified_effective', 'closed'])

    const { count: criticalCount } = await supabase
      .from('nonconformities')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', membership.tenant_id)
      .eq('severity', 'critical')
      .neq('status', 'closed')

    stats = {
      open: openCount || 0,
      inProgress: inProgressCount || 0,
      closed: closedCount || 0,
      critical: criticalCount || 0,
    }
  }

  const canCreate = ['tenant_admin', 'quality_manager', 'process_owner', 'internal_auditor', 'super_admin'].includes(
    membership?.role || '',
  )

  return (
    <NonconformitiesContent
      nonconformities={nonconformities}
      stats={stats}
      canCreate={canCreate}
    />
  )
}

function NonconformitiesContent({
  nonconformities,
  stats,
  canCreate,
}: {
  nonconformities: Array<{
    id: string
    nc_number: string
    title: string
    severity: string
    status: string
    source: string
    detected_at: string
    due_date: string | null
  }>
  stats: { open: number; inProgress: number; closed: number; critical: number }
  canCreate: boolean
}) {
  const t = useTranslations('Nonconformities')

  const severityVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    minor: 'secondary',
    major: 'default',
    critical: 'destructive',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        {canCreate && (
          <Button>
            <Plus className="me-2 h-4 w-4" />
            {t('create')}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('statsOpen')}</p>
            <p className="text-2xl font-bold">{stats.open}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('statsInProgress')}</p>
            <p className="text-2xl font-bold">{stats.inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('statsClosed')}</p>
            <p className="text-2xl font-bold text-success">{stats.closed}</p>
          </CardContent>
        </Card>
        <Card className={stats.critical > 0 ? 'border-destructive' : ''}>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('statsCritical')}</p>
            <p className={`text-2xl font-bold ${stats.critical > 0 ? 'text-destructive' : ''}`}>
              {stats.critical}
            </p>
          </CardContent>
        </Card>
      </div>

      {nonconformities.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <p className="mt-4 text-lg font-medium">{t('noNCs')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {nonconformities.map((nc) => (
            <Card key={nc.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className={`mt-1 h-5 w-5 ${
                      nc.severity === 'critical'
                        ? 'text-destructive'
                        : nc.severity === 'major'
                          ? 'text-warning'
                          : 'text-muted-foreground'
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{nc.nc_number}</span>
                      <Badge variant={severityVariant[nc.severity] || 'secondary'}>
                        {t(`severity.${nc.severity}` as never)}
                      </Badge>
                      <Badge variant="outline">
                        {t(`status.${nc.status}` as never)}
                      </Badge>
                    </div>
                    <p className="mt-1 font-medium">{nc.title}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{t('source')}: {t(`source.${nc.source}` as never)}</span>
                      <span>{t('detected')}: {new Date(nc.detected_at).toLocaleDateString()}</span>
                      {nc.due_date && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t('due')}: {new Date(nc.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Link href={`/tenant/nonconformities/${nc.id}`}>
                  <Button size="sm" variant="outline">
                    {t('view')}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
