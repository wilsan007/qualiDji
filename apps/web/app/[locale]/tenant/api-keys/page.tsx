import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Key, Plus, Building2, Copy, Trash2, Activity } from 'lucide-react'

export default async function ApiKeysPage({
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

  let apiKeys: any[] = []
  let siteGroups: any[] = []

  if (membership) {
    const { data } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, scopes, is_active, expires_at, last_used_at, created_at')
      .eq('tenant_id', membership.tenant_id)
      .order('created_at', { ascending: false })
    if (data) apiKeys = data

    const { data: groups } = await supabase
      .from('site_groups')
      .select(`
        id, name, description, is_active,
        site_group_members (tenant_id)
      `)
      .eq('parent_tenant_id', membership.tenant_id)
      .order('created_at', { ascending: false })
    if (groups) siteGroups = groups
  }

  const canManage = ['tenant_admin', 'super_admin'].includes(membership?.role || '')

  return <ApiKeysContent apiKeys={apiKeys} siteGroups={siteGroups} canManage={canManage} />
}

function ApiKeysContent({
  apiKeys,
  siteGroups,
  canManage,
}: {
  apiKeys: any[]
  siteGroups: any[]
  canManage: boolean
}) {
  const t = useTranslations('ApiKeys')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Key className="h-6 w-6 text-primary" />
          {t('title')}
        </h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Multi-site groups */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {t('siteGroups')} ({siteGroups.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {siteGroups.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noSiteGroups')}</p>
          )}
          {siteGroups.map((sg) => (
            <div key={sg.id} className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">{sg.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {sg.site_group_members?.length || 0} {t('sites')}
                  </p>
                </div>
              </div>
              {sg.is_active && <Badge variant="default">{t('active')}</Badge>}
            </div>
          ))}
          {canManage && (
            <Button size="sm" variant="outline" className="w-full">
              <Plus className="me-2 h-4 w-4" />
              {t('createGroup')}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {t('apiKeys')} ({apiKeys.length})
            </CardTitle>
            {canManage && (
              <Button size="sm">
                <Plus className="me-2 h-4 w-4" />
                {t('createKey')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {apiKeys.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noApiKeys')}</p>
          )}
          {apiKeys.map((key) => (
            <div key={key.id} className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-start gap-3">
                <Key className="mt-1 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">{key.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono">
                      {key.key_prefix}••••••••
                    </code>
                    {key.scopes.map((scope: string) => (
                      <Badge key={scope} variant="outline" className="text-xs">
                        {t(`scope.${scope}` as never)}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    {key.last_used_at && (
                      <span className="flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        {t('lastUsed')}: {new Date(key.last_used_at).toLocaleDateString()}
                      </span>
                    )}
                    {key.expires_at && (
                      <span>{t('expires')}: {new Date(key.expires_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {key.is_active ? (
                  <Badge variant="default">{t('active')}</Badge>
                ) : (
                  <Badge variant="secondary">{t('revoked')}</Badge>
                )}
                {canManage && (
                  <Button size="sm" variant="ghost">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
