import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Boxes, Plus, AlertTriangle, Search, ArrowRightLeft, Calendar } from 'lucide-react'

export default async function TraceabilityPage({
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

  let lots: any[] = []
  let recallSims: any[] = []

  if (membership) {
    const { data } = await supabase
      .from('lots')
      .select(`
        id, lot_number, quantity_received, quantity_current, unit,
        received_date, expiry_date, status, is_blocked, blocked_reason,
        products (name, code)
      `)
      .eq('tenant_id', membership.tenant_id)
      .order('received_date', { ascending: false })
      .limit(50)
    if (data) lots = data

    const { data: recalls } = await supabase
      .from('recall_simulations')
      .select('id, name, status, initiated_at, completed_at, total_lots_found, time_to_complete_minutes')
      .eq('tenant_id', membership.tenant_id)
      .order('initiated_at', { ascending: false })
      .limit(10)
    if (recalls) recallSims = recalls
  }

  const canManage = ['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'].includes(
    membership?.role || '',
  )

  return (
    <TraceabilityContent lots={lots} recallSims={recallSims} canManage={canManage} />
  )
}

function TraceabilityContent({
  lots,
  recallSims,
  canManage,
}: {
  lots: any[]
  recallSims: any[]
  canManage: boolean
}) {
  const t = useTranslations('Traceability')

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    received: 'outline',
    in_storage: 'default',
    in_process: 'default',
    finished: 'default',
    shipped: 'secondary',
    quarantine: 'destructive',
    rejected: 'destructive',
    recalled: 'destructive',
  }

  const today = new Date()
  const expiringSoon = lots.filter((l) => {
    if (!l.expiry_date) return false
    const days = Math.ceil((new Date(l.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return days <= 30 && days >= 0
  }).length

  const expired = lots.filter((l) => {
    if (!l.expiry_date) return false
    return new Date(l.expiry_date) < today
  }).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Boxes className="h-6 w-6 text-primary" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline">
              <Search className="me-2 h-4 w-4" />
              {t('traceSearch')}
            </Button>
            <Button>
              <Plus className="me-2 h-4 w-4" />
              {t('createLot')}
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('totalLots')}</p>
            <p className="text-2xl font-bold">{lots.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('blocked')}</p>
            <p className="text-2xl font-bold text-destructive">
              {lots.filter((l) => l.is_blocked).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('expiringSoon')}</p>
            <p className="text-2xl font-bold text-warning">{expiringSoon}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('expired')}</p>
            <p className="text-2xl font-bold text-destructive">{expired}</p>
          </CardContent>
        </Card>
      </div>

      {/* Recall simulations */}
      {recallSims.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {t('recallSimulations')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recallSims.map((rs) => (
              <div key={rs.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">{rs.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(rs.initiated_at).toLocaleDateString()}
                    {rs.completed_at && ` → ${new Date(rs.completed_at).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {rs.total_lots_found !== null && (
                    <span className="text-sm font-medium">
                      {rs.total_lots_found} {t('lotsFound')}
                    </span>
                  )}
                  {rs.time_to_complete_minutes !== null && (
                    <span className="text-xs text-muted-foreground">
                      {Math.round(rs.time_to_complete_minutes)} {t('minutes')}
                    </span>
                  )}
                  <Badge variant={rs.status === 'completed' ? 'default' : 'outline'}>
                    {t(`recallStatus.${rs.status}` as never)}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Lots list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            {t('lotsList')} ({lots.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {lots.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noLots')}</p>
          )}
          {lots.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-start gap-3">
                <Boxes className="mt-1 h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{l.lot_number}</span>
                    {l.is_blocked && (
                      <Badge variant="destructive">{t('blocked')}</Badge>
                    )}
                    <Badge variant={statusVariant[l.status] || 'outline'}>
                      {t(`lotStatus.${l.status}` as never)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm font-medium">
                    {l.products?.code} — {l.products?.name}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {t('received')}: {new Date(l.received_date).toLocaleDateString()}
                    </span>
                    {l.expiry_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {t('expiry')}: {new Date(l.expiry_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-end">
                <p className="text-sm font-medium">
                  {l.quantity_current} / {l.quantity_received} {l.unit}
                </p>
                <p className="text-xs text-muted-foreground">{t('currentReceived')}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
