import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClipboardCheck, Plus, CheckCircle2, Calendar } from 'lucide-react'
import Link from 'next/link'

export default async function AuditsPage({
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

  let audits: Array<{
    id: string
    audit_number: string
    title: string
    type: string
    status: string
    scheduled_date: string | null
    start_date: string | null
    end_date: string | null
  }> = []

  let stats = { planned: 0, inProgress: 0, completed: 0 }

  if (membership) {
    const { data } = await supabase
      .from('audit_cycles')
      .select('id, audit_number, title, type, status, scheduled_date, start_date, end_date')
      .eq('tenant_id', membership.tenant_id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (data) audits = data

    const { count: plannedCount } = await supabase
      .from('audit_cycles')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', membership.tenant_id)
      .in('status', ['planned', 'scheduled'])

    const { count: inProgressCount } = await supabase
      .from('audit_cycles')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', membership.tenant_id)
      .in('status', ['in_progress', 'reporting'])

    const { count: completedCount } = await supabase
      .from('audit_cycles')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', membership.tenant_id)
      .eq('status', 'completed')

    stats = {
      planned: plannedCount || 0,
      inProgress: inProgressCount || 0,
      completed: completedCount || 0,
    }
  }

  const canCreate = ['tenant_admin', 'quality_manager', 'internal_auditor', 'super_admin'].includes(
    membership?.role || '',
  )

  return (
    <AuditsContent audits={audits} stats={stats} canCreate={canCreate} />
  )
}

function AuditsContent({
  audits,
  stats,
  canCreate,
}: {
  audits: Array<{
    id: string
    audit_number: string
    title: string
    type: string
    status: string
    scheduled_date: string | null
    start_date: string | null
    end_date: string | null
  }>
  stats: { planned: number; inProgress: number; completed: number }
  canCreate: boolean
}) {
  const t = useTranslations('Audits')

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    planned: 'outline',
    scheduled: 'outline',
    in_progress: 'default',
    reporting: 'default',
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
        {canCreate && (
          <Button>
            <Plus className="me-2 h-4 w-4" />
            {t('create')}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('statsPlanned')}</p>
            <p className="text-2xl font-bold">{stats.planned}</p>
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
            <p className="text-sm text-muted-foreground">{t('statsCompleted')}</p>
            <p className="text-2xl font-bold text-success">{stats.completed}</p>
          </CardContent>
        </Card>
      </div>

      {audits.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">{t('noAudits')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {audits.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <ClipboardCheck className="mt-1 h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{a.audit_number}</span>
                      <Badge variant={statusVariant[a.status] || 'outline'}>
                        {t(`status.${a.status}` as never)}
                      </Badge>
                      <Badge variant="outline">
                        {t(`type.${a.type}` as never)}
                      </Badge>
                    </div>
                    <p className="mt-1 font-medium">{a.title}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      {a.scheduled_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(a.scheduled_date).toLocaleDateString()}
                        </span>
                      )}
                      {a.start_date && a.end_date && (
                        <span>
                          {new Date(a.start_date).toLocaleDateString()} —{' '}
                          {new Date(a.end_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Link href={`/tenant/audits/${a.id}`}>
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
