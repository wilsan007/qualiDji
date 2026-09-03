import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ShieldCheck, Plus, AlertTriangle, TrendingUp, Clock } from 'lucide-react'
import Link from 'next/link'

export default async function RisksPage({
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

  let risks: Array<{
    id: string
    code: string
    type: string
    description: string
    severity: number
    likelihood: number
    detectability: number
    score: number
    status: string
    treatment: string | null
    next_review_date: string | null
  }> = []

  const stats = { total: 0, high: 0, opportunities: 0, overdue: 0 }

  if (membership) {
    const { data } = await supabase
      .from('risks')
      .select('id, code, type, description, severity, likelihood, detectability, score, status, treatment, next_review_date')
      .eq('tenant_id', membership.tenant_id)
      .order('score', { ascending: false })
      .limit(100)
    if (data) risks = data

    const { count } = await supabase
      .from('risks')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', membership.tenant_id)
      .neq('status', 'closed')
    stats.total = count || 0

    const { count: highCount } = await supabase
      .from('risks')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', membership.tenant_id)
      .gte('score', 60)
      .neq('status', 'closed')
    stats.high = highCount || 0

    const { count: oppCount } = await supabase
      .from('risks')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', membership.tenant_id)
      .eq('type', 'opportunity')
      .neq('status', 'closed')
    stats.opportunities = oppCount || 0

    const { count: overdueCount } = await supabase
      .from('risks')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', membership.tenant_id)
      .lt('next_review_date', new Date().toISOString().split('T')[0])
      .neq('status', 'closed')
    stats.overdue = overdueCount || 0
  }

  const canCreate = ['tenant_admin', 'quality_manager', 'process_owner', 'director', 'super_admin'].includes(
    membership?.role || '',
  )

  return <RisksContent risks={risks} stats={stats} canCreate={canCreate} />
}

function RisksContent({
  risks,
  stats,
  canCreate,
}: {
  risks: Array<{
    id: string
    code: string
    type: string
    description: string
    severity: number
    likelihood: number
    detectability: number
    score: number
    status: string
    treatment: string | null
    next_review_date: string | null
  }>
  stats: { total: number; high: number; opportunities: number; overdue: number }
  canCreate: boolean
}) {
  const t = useTranslations('Risks')

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-destructive'
    if (score >= 40) return 'text-warning'
    return 'text-success'
  }

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    identified: 'outline',
    under_evaluation: 'outline',
    treated: 'default',
    monitored: 'default',
    closed: 'secondary',
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
            <p className="text-sm text-muted-foreground">{t('statsTotal')}</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className={stats.high > 0 ? 'border-destructive' : ''}>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('statsHigh')}</p>
            <p className={`text-2xl font-bold ${stats.high > 0 ? 'text-destructive' : ''}`}>
              {stats.high}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('statsOpportunities')}</p>
            <p className="text-2xl font-bold text-success">{stats.opportunities}</p>
          </CardContent>
        </Card>
        <Card className={stats.overdue > 0 ? 'border-warning' : ''}>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('statsOverdue')}</p>
            <p className={`text-2xl font-bold ${stats.overdue > 0 ? 'text-warning' : ''}`}>
              {stats.overdue}
            </p>
          </CardContent>
        </Card>
      </div>

      {risks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ShieldCheck className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">{t('noRisks')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {risks.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  {r.type === 'risk' ? (
                    <AlertTriangle className={`mt-1 h-5 w-5 ${r.score >= 60 ? 'text-destructive' : 'text-warning'}`} />
                  ) : (
                    <TrendingUp className="mt-1 h-5 w-5 text-success" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{r.code}</span>
                      <Badge variant="outline">
                        {t(`type.${r.type}` as never)}
                      </Badge>
                      <Badge variant={statusVariant[r.status] || 'outline'}>
                        {t(`status.${r.status}` as never)}
                      </Badge>
                    </div>
                    <p className="mt-1 font-medium">{r.description}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{t('severity')}: {r.severity}/5</span>
                      <span>{t('likelihood')}: {r.likelihood}/5</span>
                      <span>{t('detectability')}: {r.detectability}/5</span>
                      <span className={`font-bold ${scoreColor(r.score)}`}>
                        {t('score')}: {r.score}
                      </span>
                      {r.next_review_date && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t('nextReview')}: {new Date(r.next_review_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Link href={`/tenant/risks/${r.id}`}>
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
