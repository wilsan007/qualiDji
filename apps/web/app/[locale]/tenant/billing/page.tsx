import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CreditCard, Crown, Check, Zap, Building2, Download, TrendingUp } from 'lucide-react'

export default async function BillingPage({
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
  let subscription: any = null
  let invoices: any[] = []
  let usage: any = null

  if (membership) {
    const { data } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price_monthly_usd', { ascending: true })
    if (data) plans = data

    const { data: sub } = await supabase
      .from('subscriptions')
      .select(`
        id, status, current_period_start, current_period_end, trial_ends_at,
        subscription_plans (id, tier, name, name_fr, price_monthly_usd, price_yearly_usd, max_sites, max_users, max_ai_requests_month, features)
      `)
      .eq('tenant_id', membership.tenant_id)
      .maybeSingle()
    if (sub) subscription = sub

    const { data: invs } = await supabase
      .from('invoices')
      .select('id, number, status, total, currency, issue_date, due_date, paid_at, pdf_url')
      .eq('tenant_id', membership.tenant_id)
      .order('issue_date', { ascending: false })
      .limit(10)
    if (invs) invoices = invs

    const { data: usageData } = await supabase
      .from('usage_tracking')
      .select('ai_requests, ai_tokens_used, storage_used_mb, active_users, documents_created, tasks_completed')
      .eq('tenant_id', membership.tenant_id)
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (usageData) usage = usageData
  }

  const canManage = ['tenant_admin', 'super_admin'].includes(membership?.role || '')

  return (
    <BillingContent
      plans={plans}
      subscription={subscription}
      invoices={invoices}
      usage={usage}
      canManage={canManage}
    />
  )
}

function BillingContent({
  plans,
  subscription,
  invoices,
  usage,
  canManage,
}: {
  plans: any[]
  subscription: any
  invoices: any[]
  usage: any
  canManage: boolean
}) {
  const t = useTranslations('Billing')

  const tierIcons: Record<string, any> = {
    discovery: Check,
    tpe: Zap,
    pme: TrendingUp,
    enterprise: Building2,
  }

  const currentTier = subscription?.subscription_plans?.tier
  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    trialing: 'outline',
    active: 'default',
    past_due: 'destructive',
    canceled: 'secondary',
    expired: 'secondary',
    suspended: 'destructive',
  }

  const invoiceStatusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    draft: 'outline',
    sent: 'default',
    paid: 'default',
    overdue: 'destructive',
    void: 'secondary',
    refunded: 'secondary',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CreditCard className="h-6 w-6 text-primary" />
          {t('title')}
        </h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Current subscription */}
      {subscription && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              {t('currentPlan')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold">
                  {subscription.subscription_plans?.name_fr || subscription.subscription_plans?.name}
                </p>
                <Badge variant={statusVariant[subscription.status] || 'outline'} className="mt-1">
                  {t(`subStatus.${subscription.status}` as never)}
                </Badge>
              </div>
              <div className="text-end">
                <p className="text-2xl font-bold">
                  ${subscription.subscription_plans?.price_monthly_usd}
                  <span className="text-sm font-normal text-muted-foreground">/{t('month')}</span>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">{t('periodStart')}</p>
                <p className="font-medium">{new Date(subscription.current_period_start).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('periodEnd')}</p>
                <p className="font-medium">{new Date(subscription.current_period_end).toLocaleDateString()}</p>
              </div>
              {subscription.trial_ends_at && (
                <div>
                  <p className="text-muted-foreground">{t('trialEnds')}</p>
                  <p className="font-medium">{new Date(subscription.trial_ends_at).toLocaleDateString()}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage */}
      {usage && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">{t('aiRequests')}</p>
              <p className="text-2xl font-bold">{usage.ai_requests}</p>
              <p className="text-xs text-muted-foreground">
                / {subscription?.subscription_plans?.max_ai_requests_month || '∞'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">{t('storageUsed')}</p>
              <p className="text-2xl font-bold">{Math.round(usage.storage_used_mb)} MB</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">{t('activeUsers')}</p>
              <p className="text-2xl font-bold">{usage.active_users}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">{t('tasksCompleted')}</p>
              <p className="text-2xl font-bold">{usage.tasks_completed}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pricing plans */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">{t('availablePlans')}</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const Icon = tierIcons[plan.tier] || Check
            const isCurrent = currentTier === plan.tier
            return (
              <Card key={plan.id} className={isCurrent ? 'border-primary' : ''}>
                <CardContent className="py-6">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <p className="font-bold">{plan.name_fr || plan.name}</p>
                    {isCurrent && <Badge variant="default">{t('current')}</Badge>}
                  </div>
                  <p className="mt-2 text-3xl font-bold">
                    ${plan.price_monthly_usd}
                    <span className="text-sm font-normal text-muted-foreground">/{t('month')}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    ${plan.price_yearly_usd}/{t('year')}
                  </p>
                  <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
                  <div className="mt-4 space-y-1 text-sm">
                    <p className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-success" />
                      {plan.max_sites} {t('sites')}
                    </p>
                    <p className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-success" />
                      {plan.max_users || '∞'} {t('users')}
                    </p>
                    <p className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-success" />
                      {plan.max_ai_requests_month} {t('aiRequestsMonth')}
                    </p>
                  </div>
                  {canManage && !isCurrent && (
                    <Button className="mt-4 w-full" size="sm" variant={plan.tier === 'discovery' ? 'outline' : 'default'}>
                      {t('upgrade')}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Invoices */}
      {invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('invoices')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-medium">{inv.number}</span>
                  <Badge variant={invoiceStatusVariant[inv.status] || 'outline'}>
                    {t(`invoiceStatus.${inv.status}` as never)}
                  </Badge>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium">
                    ${inv.total} {inv.currency}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(inv.issue_date).toLocaleDateString()}
                  </span>
                  {inv.pdf_url && (
                    <Button size="sm" variant="ghost">
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
