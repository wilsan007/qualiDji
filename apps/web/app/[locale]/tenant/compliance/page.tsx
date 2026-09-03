import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { TrendingUp, FileText, AlertCircle } from 'lucide-react'

export default async function CompliancePage({
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

  // Get tenant's memberships
  const { data: membership } = await supabase
    .from('memberships')
    .select('tenant_id')
    .eq('user_id', user?.id)
    .single()

  let complianceData: Array<{
    chapter: string
    chapter_title: string
    avg_score: number
    requirement_count: number
    covered_count: number
  }> = []
  let hasAssessment = false

  if (membership) {
    // Check if there's a completed assessment
    const { data: assessment } = await supabase
      .from('assessments')
      .select('id')
      .eq('tenant_id', membership.tenant_id)
      .eq('standard_id', '90000000-0000-0000-0000-000000000001')
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(1)
      .single()

    if (assessment) {
      hasAssessment = true
      // Call compute_compliance_summary function
      const { data } = await supabase.rpc('compute_compliance_summary', {
        p_tenant_id: membership.tenant_id,
        p_standard_id: '90000000-0000-0000-0000-000000000001',
      })
      if (data) complianceData = data
    }
  }

  return <ComplianceContent data={complianceData} hasAssessment={hasAssessment} locale={locale} />
}

function ComplianceContent({
  data,
  hasAssessment,
  locale,
}: {
  data: Array<{
    chapter: string
    chapter_title: string
    avg_score: number
    requirement_count: number
    covered_count: number
  }>
  hasAssessment: boolean
  locale: string
}) {
  const t = useTranslations('Compliance')

  if (!hasAssessment) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">{t('noAssessment')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
            <Link href={`/${locale}/tenant/diagnostic`} className="mt-6">
              <Button>{t('runDiagnostic')}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const overallScore = data.length > 0
    ? Math.round(data.reduce((sum, d) => sum + d.avg_score, 0) / data.length)
    : 0

  const chapterNames: Record<string, string> = {
    '4': 'Contexte',
    '5': 'Leadership',
    '6': 'Planification',
    '7': 'Support',
    '8': 'Réalisation',
    '9': 'Évaluation',
    '10': 'Amélioration',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Overall score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            {t('overall')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="relative flex h-32 w-32 items-center justify-center">
              <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="10"
                  strokeDasharray={`${(overallScore / 100) * 327} 327`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-3xl font-bold">{overallScore}%</span>
            </div>
            <div className="flex-1 space-y-2">
              {data.map((d) => (
                <div key={d.chapter} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">
                      {d.chapter}. {chapterNames[d.chapter] || d.chapter_title}
                    </span>
                    <span className="text-muted-foreground">
                      {Math.round(d.avg_score)}% · {d.covered_count}/{d.requirement_count} {t('covered')}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${d.avg_score}%`,
                        backgroundColor:
                          d.avg_score >= 75
                            ? 'hsl(var(--success))'
                            : d.avg_score >= 50
                              ? 'hsl(var(--warning))'
                              : 'hsl(var(--destructive))',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Link href={`/${locale}/tenant/diagnostic`}>
          <Button variant="outline">
            <FileText className="me-2 h-4 w-4" />
            {t('runDiagnostic')}
          </Button>
        </Link>
      </div>
    </div>
  )
}
