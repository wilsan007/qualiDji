import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GitBranch, Plus, Users, ArrowRight } from 'lucide-react'

export default async function ProcessesPage({
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

  let processes: Array<{
    id: string
    name: string
    code: string
    type: string
    owner_id: string | null
    description: string | null
    inputs: string[] | null
    outputs: string[] | null
    is_core: boolean
  }> = []

  if (membership) {
    const { data } = await supabase
      .from('processes')
      .select('id, name, code, type, owner_id, description, inputs, outputs, is_core')
      .eq('tenant_id', membership.tenant_id)
      .order('code', { ascending: true })
    if (data) processes = data
  }

  const canCreate = ['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'].includes(
    membership?.role || '',
  )

  return <ProcessesContent processes={processes} canCreate={canCreate} />
}

function ProcessesContent({
  processes,
  canCreate,
}: {
  processes: Array<{
    id: string
    name: string
    code: string
    type: string
    owner_id: string | null
    description: string | null
    inputs: string[] | null
    outputs: string[] | null
    is_core: boolean
  }>
  canCreate: boolean
}) {
  const t = useTranslations('Processes')

  const typeColor: Record<string, 'default' | 'secondary' | 'outline'> = {
    management: 'default',
    operational: 'secondary',
    support: 'outline',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        {canCreate && (
          <Button>
            <Plus className="me-2 h-4 w-4" />
            {t('create')}
          </Button>
        )}
      </div>

      {processes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <GitBranch className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">{t('noProcesses')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {processes.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">{p.code}</span>
                  <Badge variant={typeColor[p.type] || 'outline'}>
                    {t(`type.${p.type}` as never)}
                  </Badge>
                  {p.is_core && (
                    <Badge variant="default">{t('coreProcess')}</Badge>
                  )}
                </div>
                <CardTitle className="text-lg">{p.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {p.description && (
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                )}

                {p.inputs && p.inputs.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {t('inputs')}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.inputs.map((input, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {input}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {p.outputs && p.outputs.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {t('outputs')}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.outputs.map((output, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          <ArrowRight className="me-1 h-3 w-3" />
                          {output}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {p.owner_id ? t('hasOwner') : t('noOwner')}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
