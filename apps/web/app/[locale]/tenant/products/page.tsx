import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Package, Plus, AlertCircle, Thermometer, Clock } from 'lucide-react'

export default async function ProductsPage({
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

  let products: any[] = []
  let allergens: any[] = []

  if (membership) {
    const { data } = await supabase
      .from('products')
      .select('id, name, code, category, description, shelf_life_days, storage_temp_min, storage_temp_max, storage_conditions, unit, is_active')
      .eq('tenant_id', membership.tenant_id)
      .eq('is_active', true)
      .order('name', { ascending: true })
    if (data) products = data

    const { data: alls } = await supabase
      .from('allergens')
      .select('id, type, name_fr, name_en, name_ar, name_so, icon')
      .order('type')
    if (alls) allergens = alls
  }

  const canManage = ['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'].includes(
    membership?.role || '',
  )

  return <ProductsContent products={products} allergens={allergens} canManage={canManage} />
}

function ProductsContent({
  products,
  allergens,
  canManage,
}: {
  products: any[]
  allergens: any[]
  canManage: boolean
}) {
  const t = useTranslations('Products')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Package className="h-6 w-6 text-primary" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        {canManage && (
          <Button>
            <Plus className="me-2 h-4 w-4" />
            {t('create')}
          </Button>
        )}
      </div>

      {/* Allergen reference */}
      <Card>
        <CardContent className="py-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="h-4 w-4 text-warning" />
            {t('allergenReference')}
          </p>
          <div className="flex flex-wrap gap-2">
            {allergens.map((a) => (
              <Badge key={a.id} variant="outline" className="gap-1">
                <span>{a.icon}</span>
                {a.name_fr}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Products list */}
      {products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Package className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">{t('noProducts')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <Card key={p.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Package className="mt-1 h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{p.code}</span>
                        <Badge variant="outline">
                          {t(`category.${p.category}` as never)}
                        </Badge>
                      </div>
                      <p className="mt-1 font-medium">{p.name}</p>
                      {p.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {p.shelf_life_days && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {p.shelf_life_days} {t('days')}
                          </span>
                        )}
                        {p.storage_temp_min !== null && p.storage_temp_max !== null && (
                          <span className="flex items-center gap-1">
                            <Thermometer className="h-3 w-3" />
                            {p.storage_temp_min}°C - {p.storage_temp_max}°C
                          </span>
                        )}
                        {p.storage_conditions && <span>{p.storage_conditions}</span>}
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-medium">{p.unit}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
