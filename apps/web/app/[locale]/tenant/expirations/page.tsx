import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, AlertTriangle, Calendar } from 'lucide-react'

export default async function ExpirationsPage({
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
    .select('tenant_id')
    .eq('user_id', user?.id)
    .single()

  let expiries: Array<{
    id: string
    entity_type: string
    entity_name: string
    expires_at: string
    is_active: boolean
  }> = []

  if (membership) {
    const { data } = await supabase
      .from('expiry_tracking')
      .select('id, entity_type, entity_name, expires_at, is_active')
      .eq('tenant_id', membership.tenant_id)
      .eq('is_active', true)
      .order('expires_at', { ascending: true })
    if (data) expiries = data
  }

  return <ExpirationsContent expiries={expiries} />
}

function ExpirationsContent({
  expiries,
}: {
  expiries: Array<{
    id: string
    entity_type: string
    entity_name: string
    expires_at: string
    is_active: boolean
  }>
}) {
  const t = useTranslations('ExpiryTracking')

  function getDaysLeft(expiresAt: string): number {
    return Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86400000)
  }

  function getStatus(daysLeft: number): 'expired' | 'expiringSoon' | 'active' {
    if (daysLeft < 0) return 'expired'
    if (daysLeft <= 30) return 'expiringSoon'
    return 'active'
  }

  const statusConfig = {
    expired: { variant: 'destructive' as const, label: t('expired') },
    expiringSoon: { variant: 'default' as const, label: t('expiringSoon') },
    active: { variant: 'secondary' as const, label: t('active') },
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {expiries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Calendar className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">{t('noExpiries')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {expiries.map((e) => {
            const daysLeft = getDaysLeft(e.expires_at)
            const status = getStatus(daysLeft)

            return (
              <Card key={e.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    {status === 'expired' ? (
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                    ) : status === 'expiringSoon' ? (
                      <Clock className="h-5 w-5 text-warning" />
                    ) : (
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">{e.entity_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('entityType')}: {e.entity_type} · {t('expiresAt')}: {new Date(e.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusConfig[status].variant}>
                      {statusConfig[status].label}
                    </Badge>
                    <span className="text-sm font-medium">
                      {daysLeft < 0
                        ? `${Math.abs(daysLeft)}j ${t('expired')}`
                        : `${daysLeft}j`}
                    </span>
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
