import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Target, Plus, TrendingUp, CheckCircle2, Clock } from 'lucide-react'

export default async function ObjectivesPage({
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

  let objectives: Array<{
    id: string
    code: string
    title: string
    description: string
    target: number
    current_value: number | null
    unit: string
    direction: string
    start_date: string
    due_date: string
    status: string
  }> = []

  if (membership) {
    const { data } = await supabase
      .from('objectives')
      .select('id, code, title, description, target, current_value, unit, direction, start_date, due_date, status')
      .eq('tenant_id', membership.tenant_id)
      .order('due_date', { ascending: true })
    if (data) objectives = data
  }

  const canCreate = ['tenant_admin', 'quality_manager', 'process_owner', 'director', 'super_admin'].includes(
    membership?.role || '',
  )

  return <ObjectivesContent objectives={objectives} canCreate={canCreate} />
}

function ObjectivesContent({
  objectives,
  canCreate,
}: {
  objectives: Array<{
    id: string
    code: string
    title: string
    description: string
    target: number
    current_value: number | null
    unit: string
    direction: string
    start_date: string
    due_date: string
    status: string
  }>
  canCreate: boolean
}) {
  const t = useTranslations('Objectives')

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    achieved: 'default',
    missed: 'destructive',
    cancelled: 'secondary',
  }

  const progress = (current: number | null, target: number, direction: string) => {
    if (current === null) return 0
    if (direction === 'increase') {
      return Math.min(100, Math.round((current / target) * 100))
    } else {
      if (current === 0) return 100
      return Math.min(100, Math.round((target / current) * 100))
    }
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

      {objectives.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Target className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">{t('noObjectives')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {objectives.map((obj) => {
            const pct = progress(obj.current_value, obj.target, obj.direction)
            return (
              <Card key={obj.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold">{obj.code}</span>
                      <Badge variant={statusVariant[obj.status] || 'outline'}>
                        {t(`status.${obj.status}` as never)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {t('due')}: {new Date(obj.due_date).toLocaleDateString()}
                    </div>
                  </div>
                  <CardTitle className="text-lg">{obj.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{obj.description}</p>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t('progress')}</span>
                      <span className="font-medium">
                        {obj.current_value ?? '—'} / {obj.target} {obj.unit}
                        {obj.status === 'achieved' && (
                          <CheckCircle2 className="ms-1 inline h-4 w-4 text-success" />
                        )}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all ${
                          obj.status === 'achieved'
                            ? 'bg-success'
                            : obj.status === 'missed'
                              ? 'bg-destructive'
                              : pct >= 75
                                ? 'bg-success'
                                : pct >= 50
                                  ? 'bg-warning'
                                  : 'bg-primary'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{pct}%</span>
                      <span>
                        {t('started')}: {new Date(obj.start_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
