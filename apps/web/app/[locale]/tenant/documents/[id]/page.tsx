import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Download, CheckCircle2, History, User } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
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

  if (!membership) notFound()

  const { data: document } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', membership.tenant_id)
    .single()

  if (!document) notFound()

  const { data: versions } = await supabase
    .from('document_versions')
    .select('*')
    .eq('document_id', id)
    .order('created_at', { ascending: false })

  const { data: approvals } = await supabase
    .from('document_approvals')
    .select('id, approver_id, role_in_approval, status, comment, approved_at')
    .eq('document_id', id)
    .order('created_at', { ascending: true })

  const { data: ack } = await supabase
    .from('document_acknowledgements')
    .select('id, status, acknowledged_at')
    .eq('document_id', id)
    .eq('user_id', user?.id)
    .single()

  const canManage = ['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'].includes(
    membership.role,
  )

  return (
    <DocumentDetailContent
      document={document}
      versions={versions || []}
      approvals={approvals || []}
      ack={ack}
      canManage={canManage}
    />
  )
}

function DocumentDetailContent({
  document,
  versions,
  approvals,
  ack,
  canManage,
}: {
  document: any
  versions: any[]
  approvals: any[]
  ack: any
  canManage: boolean
}) {
  const t = useTranslations('Documents')

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    draft: 'secondary',
    in_review: 'outline',
    approved: 'default',
    published: 'default',
    archived: 'secondary',
    obsolete: 'destructive',
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/tenant/documents"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t('backToList')}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{document.code}</span>
                <Badge variant={statusVariant[document.status] || 'secondary'}>
                  {t(`status.${document.status}` as never)}
                </Badge>
                <Badge variant="outline">
                  {t(`type.${document.type}` as never)}
                </Badge>
              </div>
              <CardTitle className="mt-2">{document.title}</CardTitle>
            </div>
            {document.current_version_id && (
              <Button variant="outline" size="sm">
                <Download className="me-2 h-4 w-4" />
                {t('download')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {document.change_log && (
            <div>
              <p className="text-sm font-medium">{t('changeLog')}</p>
              <p className="text-sm text-muted-foreground">{document.change_log}</p>
            </div>
          )}

          {ack && ack.status === 'pending' && (
            <div className="flex items-center gap-3 rounded-md border border-warning bg-warning/10 p-3">
              <CheckCircle2 className="h-5 w-5 text-warning" />
              <p className="text-sm">{t('ackRequired')}</p>
              <form action={`/api/documents/${document.id}/acknowledge`} method="POST" className="ms-auto">
                <Button size="sm">
                  <CheckCircle2 className="me-2 h-4 w-4" />
                  {t('acknowledge')}
                </Button>
              </form>
            </div>
          )}

          {ack && ack.status === 'acknowledged' && (
            <div className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" />
              {t('acknowledged')}{' '}
              {ack.acknowledged_at &&
                new Date(ack.acknowledged_at).toLocaleDateString()}
            </div>
          )}
        </CardContent>
      </Card>

      {approvals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {t('approvals')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {approvals.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      a.status === 'approved'
                        ? 'default'
                        : a.status === 'rejected'
                          ? 'destructive'
                          : 'outline'
                    }
                  >
                    {t(`approvalStatus.${a.status}` as never)}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium">{a.role_in_approval}</p>
                    {a.comment && (
                      <p className="text-xs text-muted-foreground">{a.comment}</p>
                    )}
                  </div>
                </div>
                {a.approved_at && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.approved_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t('versionHistory')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {versions.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-mono text-sm font-medium">v{v.version_number}</p>
                  {v.change_log && (
                    <p className="text-xs text-muted-foreground">{v.change_log}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {v.id === document.current_version_id && (
                  <Badge variant="default">{t('currentVersion')}</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {new Date(v.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
