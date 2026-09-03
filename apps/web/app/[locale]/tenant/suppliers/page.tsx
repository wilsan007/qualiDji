import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Factory, Plus, CheckCircle2, AlertTriangle, Mail } from 'lucide-react'
import Link from 'next/link'

export default async function SuppliersPage({
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

  let suppliers: Array<{
    id: string
    name: string
    code: string
    category: string | null
    criticality: string
    status: string
    email: string | null
    approval_date: string | null
  }> = []

  let expiringDocs = 0

  if (membership) {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name, code, category, criticality, status, email, approval_date')
      .eq('tenant_id', membership.tenant_id)
      .order('name', { ascending: true })
    if (data) suppliers = data

    const { count } = await supabase
      .from('supplier_documents')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', membership.tenant_id)
      .lte('expires_at', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .gte('expires_at', new Date().toISOString().split('T')[0])
    expiringDocs = count || 0
  }

  const canManage = ['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'].includes(
    membership?.role || '',
  )

  return (
    <SuppliersContent
      suppliers={suppliers}
      expiringDocs={expiringDocs}
      canManage={canManage}
    />
  )
}

function SuppliersContent({
  suppliers,
  expiringDocs,
  canManage,
}: {
  suppliers: Array<{
    id: string
    name: string
    code: string
    category: string | null
    criticality: string
    status: string
    email: string | null
    approval_date: string | null
  }>
  expiringDocs: number
  canManage: boolean
}) {
  const t = useTranslations('Suppliers')

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    approved: 'default',
    conditional: 'outline',
    disqualified: 'destructive',
    prospective: 'secondary',
  }

  const criticalityColor: Record<string, string> = {
    low: 'text-muted-foreground',
    medium: 'text-warning',
    high: 'text-warning',
    critical: 'text-destructive',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        {canManage && (
          <Button>
            <Plus className="me-2 h-4 w-4" />
            {t('create')}
          </Button>
        )}
      </div>

      {expiringDocs > 0 && (
        <Card className="border-warning">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <p className="text-sm">
              {t('expiringDocs')} ({expiringDocs})
            </p>
          </CardContent>
        </Card>
      )}

      {suppliers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Factory className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">{t('noSuppliers')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {suppliers.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <Factory className="mt-1 h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{s.code}</span>
                      <Badge variant={statusVariant[s.status] || 'outline'}>
                        {t(`status.${s.status}` as never)}
                      </Badge>
                      <span className={`text-xs font-medium ${criticalityColor[s.criticality] || ''}`}>
                        {t(`criticality.${s.criticality}` as never)}
                      </span>
                    </div>
                    <p className="mt-1 font-medium">{s.name}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      {s.category && <span>{t(`category.${s.category}` as never)}</span>}
                      {s.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {s.email}
                        </span>
                      )}
                      {s.approval_date && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {new Date(s.approval_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Link href={`/tenant/suppliers/${s.id}`}>
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
