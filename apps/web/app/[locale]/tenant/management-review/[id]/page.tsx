import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClipboardList, Calendar, Users, FileText, Target, CheckCircle2, ArrowRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function ReviewDetailPage({
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

  const { data: review } = await supabase
    .from('management_reviews')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', membership.tenant_id)
    .single()

  if (!review) notFound()

  const { data: inputs } = await supabase
    .from('review_inputs')
    .select('*')
    .eq('review_id', id)
    .order('compiled_at', { ascending: true })

  const { data: decisions } = await supabase
    .from('review_decisions')
    .select('*')
    .eq('review_id', id)
    .order('created_at', { ascending: false })

  const canManage = ['tenant_admin', 'quality_manager', 'director', 'super_admin'].includes(
    membership.role,
  )

  return (
    <ReviewDetailContent
      review={review}
      inputs={inputs || []}
      decisions={decisions || []}
      canManage={canManage}
    />
  )
}

function ReviewDetailContent({
  review,
  inputs,
  decisions,
  canManage,
}: {
  review: any
  inputs: any[]
  decisions: any[]
  canManage: boolean
}) {
  const t = useTranslations('ManagementReview')

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    planned: 'outline',
    in_progress: 'default',
    completed: 'default',
    cancelled: 'destructive',
  }

  const inputIcons: Record<string, any> = {
    context_changes: FileText,
    performance: Target,
    customer_satisfaction: Users,
    capa_effectiveness: CheckCircle2,
    audit_results: ClipboardList,
    nonconformities: Target,
    risks_opportunities: Target,
    objectives: Target,
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/tenant/management-review"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t('backToList')}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <ClipboardList className="h-6 w-6 text-primary" />
            <div>
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant[review.status] || 'outline'}>
                  {t(`status.${review.status}` as never)}
                </Badge>
              </div>
              <CardTitle className="mt-2">{review.title}</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {t('reviewDate')}
              </p>
              <p className="text-sm font-medium">
                {new Date(review.review_date).toLocaleDateString()}
              </p>
            </div>
            {review.location && (
              <div>
                <p className="text-xs text-muted-foreground">{t('location')}</p>
                <p className="text-sm font-medium">{review.location}</p>
              </div>
            )}
            <div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {t('participants')}
              </p>
              <p className="text-sm font-medium">{review.participant_ids?.length || 0}</p>
            </div>
          </div>
          {review.scope && (
            <div>
              <p className="text-sm font-medium">{t('scope')}</p>
              <p className="text-sm text-muted-foreground">{review.scope}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Inputs (ISO 9001 §9.3.2) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('inputs')} ({inputs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {inputs.length === 0 && (
            <div className="flex flex-col items-center py-8 text-center">
              <p className="text-sm text-muted-foreground">{t('noInputs')}</p>
              {canManage && review.status === 'planned' && (
                <Button size="sm" variant="outline" className="mt-4">
                  <FileText className="me-2 h-4 w-4" />
                  {t('compileInputs')}
                </Button>
              )}
            </div>
          )}
          {inputs.map((input) => {
            const Icon = inputIcons[input.input_type] || FileText
            return (
              <div key={input.id} className="rounded-md border p-4">
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">{input.title}</p>
                    {input.summary && (
                      <p className="mt-1 text-sm text-muted-foreground">{input.summary}</p>
                    )}
                    {input.data && typeof input.data === 'object' && (
                      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                        {Object.entries(input.data).map(([key, value]) => (
                          <div key={key} className="rounded bg-muted px-2 py-1">
                            <p className="text-xs text-muted-foreground">{key}</p>
                            <p className="text-sm font-medium">{String(value)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Review Decisions (ISO 9001 §9.3.3) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            {t('decisions')} ({decisions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {decisions.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noDecisions')}</p>
          )}
          {decisions.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-start gap-3">
                <ArrowRight className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <Badge variant="outline" className="mb-1">
                    {t(`decisionType.${d.decision_type}` as never)}
                  </Badge>
                  <p className="text-sm">{d.description}</p>
                  {d.due_date && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('due')}: {new Date(d.due_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant={d.status === 'open' ? 'outline' : 'default'}>
                {d.status}
              </Badge>
            </div>
          ))}
          {canManage && review.status === 'in_progress' && (
            <Button size="sm" variant="outline" className="w-full">
              <Plus className="me-2 h-4 w-4" />
              {t('addDecision')}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
