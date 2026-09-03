import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ShieldCheck, Plus, CheckCircle2, Circle } from 'lucide-react'

export default async function PrpPage({
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

  let prpLibrary: any[] = []
  let prpInstances: any[] = []

  if (membership) {
    const { data } = await supabase
      .from('prp_library')
      .select('id, code, title, title_en, title_ar, title_so, category, description, iso_reference, default_frequency')
      .eq('is_active', true)
      .order('code')
    if (data) prpLibrary = data

    const { data: instances } = await supabase
      .from('prp_instances')
      .select('id, code, title, status, prp_library_id, activated_at')
      .eq('tenant_id', membership.tenant_id)
      .order('code')
    if (instances) prpInstances = instances
  }

  const canManage = ['tenant_admin', 'quality_manager', 'super_admin'].includes(
    membership?.role || '',
  )

  // Map of which PRP library items are activated
  const activatedMap = new Map(prpInstances.map((pi) => [pi.prp_library_id, pi]))

  return (
    <PrpContent
      prpLibrary={prpLibrary}
      prpInstances={prpInstances}
      activatedMap={activatedMap}
      canManage={canManage}
    />
  )
}

function PrpContent({
  prpLibrary,
  prpInstances,
  activatedMap,
  canManage,
}: {
  prpLibrary: any[]
  prpInstances: any[]
  activatedMap: Map<string, any>
  canManage: boolean
}) {
  const t = useTranslations('Prp')

  const activeCount = prpInstances.filter((pi) => pi.status === 'active').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="h-6 w-6 text-primary" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        {canManage && (
          <Button>
            <Plus className="me-2 h-4 w-4" />
            {t('activate')}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('available')}</p>
            <p className="text-2xl font-bold">{prpLibrary.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('activated')}</p>
            <p className="text-2xl font-bold text-success">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('pending')}</p>
            <p className="text-2xl font-bold text-muted-foreground">
              {prpLibrary.length - activeCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* PRP Library */}
      <div className="space-y-3">
        {prpLibrary.map((prp) => {
          const instance = activatedMap.get(prp.id)
          const isActivated = !!instance
          return (
            <Card key={prp.id} className={isActivated ? '' : 'opacity-80'}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {isActivated ? (
                      <CheckCircle2 className="mt-1 h-5 w-5 text-success" />
                    ) : (
                      <Circle className="mt-1 h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold">{prp.code}</span>
                        <Badge variant="outline">
                          {t(`category.${prp.category}` as never)}
                        </Badge>
                        {isActivated && (
                          <Badge variant="default">{t('active')}</Badge>
                        )}
                      </div>
                      <p className="mt-1 font-medium">{prp.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{prp.description}</p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        {prp.iso_reference && (
                          <span className="font-mono">{prp.iso_reference}</span>
                        )}
                        {prp.default_frequency && (
                          <span>{t(`frequency.${prp.default_frequency}` as never)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {!isActivated && canManage && (
                    <Button size="sm" variant="outline">
                      {t('activate')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
