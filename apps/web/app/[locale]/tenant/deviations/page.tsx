import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Thermometer, Activity, Radio } from 'lucide-react'

export default async function DeviationsPage({
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

  let deviations: any[] = []
  let sensors: any[] = []

  if (membership) {
    const { data } = await supabase
      .from('deviations')
      .select(`
        id, description, measured_value, expected_min, expected_max,
        disposition, status, lot_number, quantity_affected,
        immediate_action, created_at, contained_at,
        control_points (code, hazard, critical_limit_text)
      `)
      .eq('tenant_id', membership.tenant_id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) deviations = data

    const { data: sens } = await supabase
      .from('iot_sensors')
      .select('id, code, name, type, status, location_description, last_calibrated_at, next_calibration_at')
      .eq('tenant_id', membership.tenant_id)
      .eq('is_active', true)
      .order('code')
    if (sens) sensors = sens
  }

  return <DeviationsContent deviations={deviations} sensors={sensors} />
}

function DeviationsContent({
  deviations,
  sensors,
}: {
  deviations: any[]
  sensors: any[]
}) {
  const t = useTranslations('Deviations')

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    open: 'destructive',
    contained: 'default',
    under_investigation: 'outline',
    corrected: 'default',
    closed: 'secondary',
  }

  const sensorStatusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    inactive: 'secondary',
    error: 'destructive',
    calibration_due: 'outline',
  }

  const openCount = deviations.filter((d) => d.status === 'open').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          {t('title')}
        </h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('totalDeviations')}</p>
            <p className="text-2xl font-bold">{deviations.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('openDeviations')}</p>
            <p className="text-2xl font-bold text-destructive">{openCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{t('activeSensors')}</p>
            <p className="text-2xl font-bold text-primary">
              {sensors.filter((s) => s.status === 'active').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* IoT Sensors */}
      {sensors.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <h2 className="mb-3 flex items-center gap-2 font-medium">
              <Radio className="h-5 w-5 text-primary" />
              {t('iotSensors')}
            </h2>
            <div className="space-y-2">
              {sensors.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <Radio className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{s.code}</span>
                        <Badge variant={sensorStatusVariant[s.status] || 'outline'}>
                          {t(`sensorStatus.${s.status}` as never)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm">{s.name}</p>
                      {s.location_description && (
                        <p className="text-xs text-muted-foreground">{s.location_description}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-end text-xs text-muted-foreground">
                    <p>{t(`sensorType.${s.type}` as never)}</p>
                    {s.next_calibration_at && (
                      <p className="mt-1">
                        {t('nextCalibration')}: {new Date(s.next_calibration_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deviations */}
      <Card>
        <CardContent className="py-4">
          <h2 className="mb-3 flex items-center gap-2 font-medium">
            <Activity className="h-5 w-5 text-destructive" />
            {t('deviationsList')} ({deviations.length})
          </h2>
          {deviations.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noDeviations')}</p>
          )}
          <div className="space-y-2">
            {deviations.map((d) => (
              <div key={d.id} className="rounded-md border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {d.control_points && (
                      <span className="font-mono text-sm font-bold">{d.control_points.code}</span>
                    )}
                    <Badge variant={statusVariant[d.status] || 'outline'}>
                      {t(`deviationStatus.${d.status}` as never)}
                    </Badge>
                    <Badge variant="outline">
                      {t(`disposition.${d.disposition}` as never)}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(d.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-sm">{d.description}</p>
                {d.control_points && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('hazard')}: {d.control_points.hazard} · {t('criticalLimit')}: {d.control_points.critical_limit_text}
                  </p>
                )}
                {d.measured_value !== null && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <Thermometer className="h-3 w-3" />
                    <span className="text-destructive">
                      {t('measured')}: {d.measured_value}
                    </span>
                    <span className="text-muted-foreground">
                      ({t('expected')}: {d.expected_min ?? '?'} - {d.expected_max ?? '?'})
                    </span>
                  </div>
                )}
                {d.immediate_action && (
                  <p className="mt-2 rounded bg-muted px-3 py-1 text-xs">
                    <span className="font-medium">{t('immediateAction')}: </span>
                    {d.immediate_action}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
