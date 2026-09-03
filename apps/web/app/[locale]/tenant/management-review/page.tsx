import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClipboardList, Plus, Calendar, Users, FileText, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

export default async function ManagementReviewPage({
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

  let reviews: Array<{
    id: string
    title: string
    review_date: string
    status: string
    location: string | null
    chairperson_id: string | null
  }> = []

  if (membership) {
    const { data } = await supabase
      .from('management_reviews')
      .select('id, title, review_date, status, location, chairperson_id')
      .eq('tenant_id', membership.tenant_id)
      .order('review_date', { ascending: false })
    if (data) reviews = data
  }

  const canCreate = ['tenant_admin', 'quality_manager', 'director', 'super_admin'].includes(
    membership?.role || '',
  )

  return <ReviewsContent reviews={reviews} canCreate={canCreate} />
}

function ReviewsContent({
  reviews,
  canCreate,
}: {
  reviews: Array<{
    id: string
    title: string
    review_date: string
    status: string
    location: string | null
    chairperson_id: string | null
  }>
  canCreate: boolean
}) {
  const t = useTranslations('ManagementReview')

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    planned: 'outline',
    in_progress: 'default',
    completed: 'default',
    cancelled: 'destructive',
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

      {reviews.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ClipboardList className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">{t('noReviews')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <ClipboardList className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant[r.status] || 'outline'}>
                        {t(`status.${r.status}` as never)}
                      </Badge>
                    </div>
                    <p className="mt-1 font-medium">{r.title}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(r.review_date).toLocaleDateString()}
                      </span>
                      {r.location && <span>{r.location}</span>}
                    </div>
                  </div>
                </div>
                <Link href={`/tenant/management-review/${r.id}`}>
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
