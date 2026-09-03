import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Plus, CheckCircle2, Clock, GitBranch, Target } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function NonconformityDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
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

  if (!membership) notFound()

  const { data: nc } = await supabase
    .from('nonconformities')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', membership.tenant_id)
    .single()

  if (!nc) notFound()

  const { data: rca } = await supabase
    .from('root_cause_analyses')
    .select('*')
    .eq('nc_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let fiveWhys: any[] = []
  let ishikawa: any[] = []

  if (rca) {
    const { data: whys } = await supabase
      .from('five_whys')
      .select('*')
      .eq('rca_id', rca.id)
      .order('step', { ascending: true })
    if (whys) fiveWhys = whys

    const { data: ish } = await supabase
      .from('ishikawa_diagrams')
      .select('*')
      .eq('rca_id', rca.id)
      .order('branch', { ascending: true })
    if (ish) ishikawa = ish
  }

  const { data: capas } = await supabase
    .from('capa_actions')
    .select('*')
    .eq('nc_id', id)
    .order('created_at', { ascending: false })

  const canManage = ['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'].includes(
    membership.role,
  )

  return (
    <NCDetailContent
      nc={nc}
      rca={rca}
      fiveWhys={fiveWhys}
      ishikawa={ishikawa}
      capas={capas || []}
      canManage={canManage}
    />
  )
}

function NCDetailContent({
  nc,
  rca,
  fiveWhys,
  ishikawa,
  capas,
  canManage,
}: {
  nc: any
  rca: any
  fiveWhys: any[]
  ishikawa: any[]
  capas: any[]
  canManage: boolean
}) {
  const t = useTranslations('Nonconformities')
  const tRca = useTranslations('Nonconformities.rca')

  const severityVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    minor: 'secondary',
    major: 'default',
    critical: 'destructive',
  }

  const capaStatusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    planned: 'outline',
    in_progress: 'default',
    completed: 'default',
    verified: 'default',
    ineffective: 'destructive',
    cancelled: 'secondary',
  }

  const ishikawaBranches = ['man', 'machine', 'material', 'method', 'measurement', 'environment']

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/tenant/nonconformities"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t('backToList')}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle
              className={`h-6 w-6 ${
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
              <CardTitle className="mt-2">{nc.title}</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">{t('description')}</p>
            <p className="text-sm text-muted-foreground">{nc.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">{t('source')}</p>
              <p className="text-sm font-medium">{t(`source.${nc.source}` as never)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('detected')}</p>
              <p className="text-sm font-medium">
                {new Date(nc.detected_at).toLocaleDateString()}
              </p>
            </div>
            {nc.due_date && (
              <div>
                <p className="text-xs text-muted-foreground">{t('due')}</p>
                <p className="text-sm font-medium">
                  {new Date(nc.due_date).toLocaleDateString()}
                </p>
              </div>
            )}
            {nc.process && (
              <div>
                <p className="text-xs text-muted-foreground">{t('process')}</p>
                <p className="text-sm font-medium">{nc.process}</p>
              </div>
            )}
          </div>

          {nc.immediate_action && (
            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">{t('immediateAction')}</p>
              <p className="text-sm text-muted-foreground">{nc.immediate_action}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Root Cause Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            {tRca('title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!rca && canManage && (
            <div className="flex items-center justify-between rounded-md border border-dashed p-4">
              <p className="text-sm text-muted-foreground">{tRca('notStarted')}</p>
              <Button size="sm" variant="outline">
                <Plus className="me-2 h-4 w-4" />
                {tRca('startAnalysis')}
              </Button>
            </div>
          )}

          {rca && (
            <>
              {fiveWhys.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">{tRca('fiveWhys')}</p>
                  <div className="space-y-2">
                    {fiveWhys.map((w) => (
                      <div key={w.id} className="rounded-md border p-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          {tRca('why')} {w.step}
                        </p>
                        <p className="text-sm font-medium">{w.question}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          → {w.answer}
                        </p>
                        {w.is_root_cause && (
                          <Badge variant="default" className="mt-2">
                            <Target className="me-1 h-3 w-3" />
                            {tRca('rootCause')}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ishikawa.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">{tRca('ishikawa')}</p>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {ishikawaBranches.map((branch) => {
                      const causes = ishikawa.filter((i) => i.branch === branch)
                      if (causes.length === 0) return null
                      return (
                        <div key={branch} className="rounded-md border p-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            {tRca(`branches.${branch}` as never)}
                          </p>
                          <ul className="mt-1 space-y-1">
                            {causes.map((c) => (
                              <li
                                key={c.id}
                                className={`text-sm ${c.is_root_cause ? 'font-bold' : ''}`}
                              >
                                • {c.cause}
                                {c.is_root_cause && (
                                  <Badge variant="default" className="ms-2">
                                    <Target className="me-1 h-3 w-3" />
                                    {tRca('rootCause')}
                                  </Badge>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {rca.summary && (
                <div className="rounded-md bg-muted p-3">
                  <p className="text-sm font-medium">{tRca('summary')}</p>
                  <p className="text-sm text-muted-foreground">{rca.summary}</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* CAPA Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            {t('capaActions')} ({capas.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {capas.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noCapas')}</p>
          )}
          {capas.map((capa) => (
            <div
              key={capa.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="flex items-start gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{capa.capa_number}</span>
                    <Badge variant="outline">
                      {t(`capaType.${capa.type}` as never)}
                    </Badge>
                    <Badge variant={capaStatusVariant[capa.status] || 'outline'}>
                      {t(`capaStatus.${capa.status}` as never)}
                    </Badge>
                  </div>
                  <p className="mt-1 font-medium">{capa.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('due')}: {new Date(capa.due_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {capa.status === 'completed' && capa.status !== 'verified' && canManage && (
                <Button size="sm" variant="outline">
                  <CheckCircle2 className="me-2 h-4 w-4" />
                  {t('verifyEffectiveness')}
                </Button>
              )}
            </div>
          ))}
          {canManage && (
            <Button size="sm" variant="outline" className="w-full">
              <Plus className="me-2 h-4 w-4" />
              {t('addCapa')}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
