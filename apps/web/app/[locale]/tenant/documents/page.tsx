import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Upload, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default async function DocumentsPage({
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

  let documents: Array<{
    id: string
    code: string
    title: string
    type: string
    status: string
    updated_at: string
    current_version_id: string | null
  }> = []

  let pendingAcks: Array<{
    id: string
    document_id: string
    document_title: string
    document_code: string
    version_id: string
    status: string
  }> = []

  if (membership) {
    const { data } = await supabase
      .from('documents')
      .select('id, code, title, type, status, updated_at, current_version_id')
      .eq('tenant_id', membership.tenant_id)
      .order('updated_at', { ascending: false })
      .limit(100)
    if (data) documents = data

    const { data: ackData } = await supabase
      .from('document_acknowledgements')
      .select(
        'id, document_id, version_id, status, documents!inner(code, title)',
      )
      .eq('tenant_id', membership.tenant_id)
      .eq('user_id', user?.id)
      .eq('status', 'pending')
    if (ackData) {
      pendingAcks = ackData.map((a: any) => ({
        id: a.id,
        document_id: a.document_id,
        version_id: a.version_id,
        status: a.status,
        document_title: a.documents?.title || '',
        document_code: a.documents?.code || '',
      }))
    }
  }

  const canManage = ['tenant_admin', 'quality_manager', 'process_owner', 'super_admin'].includes(
    membership?.role || '',
  )

  return (
    <DocumentsContent
      documents={documents}
      pendingAcks={pendingAcks}
      canManage={canManage}
    />
  )
}

function DocumentsContent({
  documents,
  pendingAcks,
  canManage,
}: {
  documents: Array<{
    id: string
    code: string
    title: string
    type: string
    status: string
    updated_at: string
    current_version_id: string | null
  }>
  pendingAcks: Array<{
    id: string
    document_id: string
    document_title: string
    document_code: string
    version_id: string
    status: string
  }>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        {canManage && (
          <Button>
            <Upload className="me-2 h-4 w-4" />
            {t('upload')}
          </Button>
        )}
      </div>

      {pendingAcks.length > 0 && (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertCircle className="h-5 w-5" />
              {t('pendingAcks')} ({pendingAcks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingAcks.map((ack) => (
              <div
                key={ack.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-warning" />
                  <div>
                    <p className="font-medium">
                      {ack.document_code} — {ack.document_title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('ackRequired')}
                    </p>
                  </div>
                </div>
                <Link href={`/tenant/documents/${ack.document_id}`}>
                  <Button size="sm" variant="outline">
                    <CheckCircle2 className="me-2 h-4 w-4" />
                    {t('acknowledge')}
                  </Button>
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">{t('noDocuments')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <FileText className="mt-1 h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{doc.code}</span>
                      <Badge variant={statusVariant[doc.status] || 'secondary'}>
                        {t(`status.${doc.status}` as never)}
                      </Badge>
                      <Badge variant="outline">
                        {t(`type.${doc.type}` as never)}
                      </Badge>
                    </div>
                    <p className="mt-1 font-medium">{doc.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('updated')}: {new Date(doc.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Link href={`/tenant/documents/${doc.id}`}>
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
