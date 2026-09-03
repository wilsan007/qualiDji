import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GitBranch, Plus, AlertTriangle, ShieldCheck, FileText, FlaskConical } from 'lucide-react'
import Link from 'next/link'

export default async function HaccpPage({
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

  let plans: any[] = []
  let controlPoints: any[] = []
  let flowDiagrams: any[] = []

  if (membership) {
    const { data } = await supabase
      .from('haccp_plans')
      .select('id, name, version, status, is_active, created_at, updated_at')
      .eq('tenant_id', membership.tenant_id)
      .order('updated_at', { ascending: false })
    if (data) plans = data

    const { data: cps } = await supabase
      .from('control_points')
      .select('id, code, type, hazard, control_measure, critical_limit_text, monitoring_frequency, is_active')
      .eq('tenant_id', membership.tenant_id)
      .eq('is_active', true)
      .order('type', { ascending: true })
      .order('code', { ascending: true })
    if (cps) controlPoints = cps

    const { data: fds } = await supabase
      .from('flow_diagrams')
      .select('id, name, version, is_verified, is_active, created_at')
      .eq('tenant_id', membership.tenant_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    if (fds) flowDiagrams = fds
  }

  const canManage = ['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'].includes(
    membership?.role || '',
  )

  return (
    <HaccpContent
      plans={plans}
      controlPoints={controlPoints}
      flowDiagrams={flowDiagrams}
      canManage={canManage}
    />
  )
}

function HaccpContent({
  plans,
  controlPoints,
  flowDiagrams,
  canManage,
}: {
  plans: any[]
  controlPoints: any[]
  flowDiagrams: any[]
  canManage: boolean
}) {
  const t = useTranslations('Haccp')

  const cpTypeVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    ccp: 'destructive',
    oprp: 'default',
    prp: 'outline',
  }

  const ccpCount = controlPoints.filter((c) => c.type === 'ccp').length
  const oprpCount = controlPoints.filter((c) => c.type === 'oprp').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FlaskConical className="h-6 w-6 text-primary" />
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
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('plans')}</p>
            <p className="text-2xl font-bold">{plans.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('ccps')}</p>
            <p className="text-2xl font-bold text-destructive">{ccpCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('oprp')}</p>
            <p className="text-2xl font-bold text-primary">{oprpCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('flowDiagrams')}</p>
            <p className="text-2xl font-bold">{flowDiagrams.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Flow diagrams */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            {t('flowDiagramsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {flowDiagrams.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noFlowDiagrams')}</p>
          )}
          {flowDiagrams.map((fd) => (
            <div key={fd.id} className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-center gap-3">
                <GitBranch className="h-4 w-4 text-primary" />
                <div>
                  <p className="font-medium">{fd.name}</p>
                  <p className="text-xs text-muted-foreground">v{fd.version}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {fd.is_verified ? (
                  <Badge variant="default">
                    <ShieldCheck className="me-1 h-3 w-3" />
                    {t('verified')}
                  </Badge>
                ) : (
                  <Badge variant="outline">{t('notVerified')}</Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* HACCP plans */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('plansTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {plans.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noPlans')}</p>
          )}
          {plans.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">v{p.version} · {new Date(p.updated_at).toLocaleDateString()}</p>
              </div>
              <Badge variant={p.status === 'active' ? 'default' : 'outline'}>
                {t(`planStatus.${p.status}` as never)}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Control points */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            {t('controlPoints')} ({controlPoints.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {controlPoints.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noControlPoints')}</p>
          )}
          {controlPoints.map((cp) => (
            <div key={cp.id} className="rounded-md border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">{cp.code}</span>
                  <Badge variant={cpTypeVariant[cp.type] || 'outline'}>
                    {t(`cpType.${cp.type}` as never)}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">{cp.monitoring_frequency}</span>
              </div>
              <p className="mt-2 text-sm font-medium">{cp.hazard}</p>
              <p className="mt-1 text-sm text-muted-foreground">{cp.control_measure}</p>
              <div className="mt-2 rounded bg-destructive/10 px-3 py-1 text-xs">
                <span className="font-medium text-destructive">{t('criticalLimit')}: </span>
                <span className="text-destructive">{cp.critical_limit_text}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
