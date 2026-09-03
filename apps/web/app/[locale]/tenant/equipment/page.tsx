import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Wrench, Plus, CheckCircle2, AlertTriangle, Clock, QrCode } from 'lucide-react'

export default async function EquipmentPage({
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

  let equipment: Array<{
    id: string
    name: string
    code: string
    serial_number: string | null
    model: string | null
    manufacturer: string | null
    location: string | null
    category: string | null
    status: string
    qr_code: string | null
  }> = []

  const calibrations: Record<string, { next_calibration_date: string; result: string }> = {}

  if (membership) {
    const { data } = await supabase
      .from('equipment')
      .select('id, name, code, serial_number, model, manufacturer, location, category, status, qr_code')
      .eq('tenant_id', membership.tenant_id)
      .order('code', { ascending: true })
    if (data) equipment = data

    // Get latest calibration for each equipment
    for (const eq of equipment) {
      const { data: cal } = await supabase
        .from('calibrations')
        .select('next_calibration_date, result')
        .eq('equipment_id', eq.id)
        .order('calibration_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cal) calibrations[eq.id] = cal
    }
  }

  const canManage = ['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'].includes(
    membership?.role || '',
  )

  return (
    <EquipmentContent
      equipment={equipment}
      calibrations={calibrations}
      canManage={canManage}
    />
  )
}

function EquipmentContent({
  equipment,
  calibrations,
  canManage,
}: {
  equipment: Array<{
    id: string
    name: string
    code: string
    serial_number: string | null
    model: string | null
    manufacturer: string | null
    location: string | null
    category: string | null
    status: string
    qr_code: string | null
  }>
  calibrations: Record<string, { next_calibration_date: string; result: string }>
  canManage: boolean
}) {
  const t = useTranslations('Equipment')

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    out_of_service: 'destructive',
    calibration_due: 'outline',
    retired: 'secondary',
  }

  const today = new Date()
  const daysUntil = (dateStr: string) => {
    const date = new Date(dateStr)
    return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
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

      {equipment.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Wrench className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">{t('noEquipment')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {equipment.map((eq) => {
            const cal = calibrations[eq.id]
            const daysLeft = cal ? daysUntil(cal.next_calibration_date) : null
            return (
              <Card key={eq.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-start gap-3">
                    <Wrench className="mt-1 h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{eq.code}</span>
                        <Badge variant={statusVariant[eq.status] || 'outline'}>
                          {t(`status.${eq.status}` as never)}
                        </Badge>
                        {eq.category && (
                          <Badge variant="outline">
                            {t(`category.${eq.category}` as never)}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 font-medium">{eq.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {eq.manufacturer && <span>{eq.manufacturer}</span>}
                        {eq.model && <span>{eq.model}</span>}
                        {eq.serial_number && <span>S/N: {eq.serial_number}</span>}
                        {eq.location && <span>{eq.location}</span>}
                        {eq.qr_code && (
                          <span className="flex items-center gap-1">
                            <QrCode className="h-3 w-3" />
                            {eq.qr_code}
                          </span>
                        )}
                      </div>
                      {cal && (
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <Clock className="h-3 w-3" />
                          <span className="text-muted-foreground">
                            {t('nextCalibration')}: {new Date(cal.next_calibration_date).toLocaleDateString()}
                          </span>
                          {daysLeft !== null && daysLeft <= 30 && daysLeft >= 0 && (
                            <Badge variant="outline" className="text-warning">
                              {t('calibrationDueSoon')}
                            </Badge>
                          )}
                          {daysLeft !== null && daysLeft < 0 && (
                            <Badge variant="destructive">
                              {t('calibrationOverdue')}
                            </Badge>
                          )}
                        </div>
                      )}
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
