import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

export default async function AnomaliesPage({
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

  let anomalies: Array<{
    id: string
    type: string
    severity: string
    description: string | null
    is_resolved: boolean
    created_at: string
    resolved_at: string | null
  }> = []

  if (membership) {
    const { data } = await supabase
      .from('anomaly_flags')
      .select('id, type, severity, description, is_resolved, created_at, resolved_at')
      .eq('tenant_id', membership.tenant_id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (data) anomalies = data
  }

  const canResolve = ['tenant_admin', 'quality_manager', 'super_admin'].includes(
    membership?.role || '',
  )

  return <AnomaliesContent anomalies={anomalies} canResolve={canResolve} />
}

function AnomaliesContent({
  anomalies,
  canResolve,
}: {
  anomalies: Array<{
    id: string
    type: string
    severity: string
    description: string | null
    is_resolved: boolean
    created_at: string
    resolved_at: string | null
  }>
  canResolve: boolean
}) {
  const t = useTranslations('Anomalies')

  const severityVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    high: 'destructive',
    medium: 'default',
    low: 'secondary',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {anomalies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <p className="mt-4 text-lg font-medium">{t('noAnomalies')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {anomalies.map((a) => (
            <Card key={a.id} className={a.is_resolved ? 'opacity-60' : ''}>
              <CardContent className="flex items-start justify-between py-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className={`mt-1 h-5 w-5 ${a.severity === 'high' ? 'text-destructive' : 'text-warning'}`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={severityVariant[a.severity] || 'secondary'}>
                        {t(`severityLevels.${a.severity}` as never)}
                      </Badge>
                      <Badge variant="outline">
                        {t(`types.${a.type}` as never)}
                      </Badge>
                      {a.is_resolved && (
                        <Badge variant="default">
                          <CheckCircle2 className="me-1 h-3 w-3" />
                          {t('resolved')}
                        </Badge>
                      )}
                    </div>
                    {a.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{a.description}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('createdAt')}: {new Date(a.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                {canResolve && !a.is_resolved && (
                  <form action={`/api/anomalies/${a.id}/resolve`} method="POST">
                    <Button size="sm" variant="outline">
                      <CheckCircle2 className="me-2 h-4 w-4" />
                      {t('resolve')}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
