import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLink, Plus, Calendar, FileText, AlertCircle, CheckCircle2, Clock, Search } from 'lucide-react'

export default async function ExternalAuditPage({
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

  let windows: any[] = []
  let evidenceRequests: any[] = []

  if (membership) {
    const { data } = await supabase
      .from('audit_windows')
      .select(`
        id, title, scope, audit_type, starts_at, ends_at, status,
        overall_result, recommendation, report_submitted_at,
        external_auditors (full_name, organization)
      `)
      .eq('tenant_id', membership.tenant_id)
      .order('starts_at', { ascending: false })
    if (data) windows = data

    const { data: reqs } = await supabase
      .from('evidence_requests')
      .select(`
        id, title, description, status, priority, deadline, created_at,
        audit_windows (title)
      `)
      .in('audit_window_id', windows.map((w) => w.id))
      .order('created_at', { ascending: false })
      .limit(20)
    if (reqs) evidenceRequests = reqs
  }

  const canManage = ['tenant_admin', 'quality_manager', 'super_admin'].includes(
    membership?.role || '',
  )

  return (
    <ExternalAuditContent
      windows={windows}
      evidenceRequests={evidenceRequests}
      canManage={canManage}
    />
  )
}

function ExternalAuditContent({
  windows,
  evidenceRequests,
  canManage,
}: {
  windows: any[]
  evidenceRequests: any[]
  canManage: boolean
}) {
  const t = useTranslations('ExternalAudit')

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    scheduled: 'outline',
    active: 'default',
    evidence_review: 'default',
    reporting: 'outline',
    completed: 'default',
    cancelled: 'destructive',
  }

  const reqStatusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending: 'outline',
    submitted: 'default',
    approved: 'default',
    rejected: 'destructive',
    overdue: 'destructive',
  }

  const activeWindows = windows.filter((w) => w.status === 'active').length
  const pendingReqs = evidenceRequests.filter((r) => r.status === 'pending').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ExternalLink className="h-6 w-6 text-primary" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        {canManage && (
          <Button>
            <Plus className="me-2 h-4 w-4" />
            {t('createWindow')}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('totalWindows')}</p>
            <p className="text-2xl font-bold">{windows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('activeWindows')}</p>
            <p className="text-2xl font-bold text-primary">{activeWindows}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('pendingRequests')}</p>
            <p className="text-2xl font-bold text-warning">{pendingReqs}</p>
          </CardContent>
        </Card>
      </div>

      {/* Evidence requests */}
      {evidenceRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              {t('evidenceRequests')} ({evidenceRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {evidenceRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-start gap-3">
                  <FileText className="mt-1 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{req.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {req.audit_windows?.title} · {new Date(req.created_at).toLocaleDateString()}
                    </p>
                    {req.deadline && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                        <Clock className="h-3 w-3" />
                        {t('deadline')}: {new Date(req.deadline).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {req.priority === 'urgent' && (
                    <Badge variant="destructive">{t('urgent')}</Badge>
                  )}
                  <Badge variant={reqStatusVariant[req.status] || 'outline'}>
                    {t(`reqStatus.${req.status}` as never)}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Audit windows */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('auditWindows')} ({windows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {windows.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noWindows')}</p>
          )}
          {windows.map((w) => (
            <div key={w.id} className="rounded-md border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant[w.status] || 'outline'}>
                    {t(`windowStatus.${w.status}` as never)}
                  </Badge>
                  <Badge variant="outline">{t(`auditType.${w.audit_type}` as never)}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(w.starts_at).toLocaleDateString()} → {new Date(w.ends_at).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-2 font-medium">{w.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{w.scope}</p>
              {w.external_auditors && (
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <ExternalLink className="h-3 w-3" />
                  {w.external_auditors.full_name} · {w.external_auditors.organization}
                </p>
              )}
              {w.overall_result && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs font-medium">{t('result')}:</span>
                  <Badge variant={w.overall_result === 'conform' ? 'default' : 'destructive'}>
                    {t(`result.${w.overall_result}` as never)}
                  </Badge>
                  {w.recommendation && (
                    <Badge variant="outline">
                      {t(`recommendation.${w.recommendation}` as never)}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
