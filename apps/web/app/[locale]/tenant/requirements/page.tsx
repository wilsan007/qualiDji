import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, Clock, User, ShieldAlert } from 'lucide-react'

export default async function RequirementsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const supabase = await createClient()

  // Fetch clauses with their requirements
  const { data: clauses } = await supabase
    .from('clauses')
    .select(
      `id, number, title, title_en, title_ar, title_so,
       requirements (id, code, statement, statement_en, statement_ar, statement_so,
       explain_novice, explain_novice_en, expected_evidence, default_period, default_role,
       is_mandatory_doc, is_mandatory_record)`,
    )
    .eq('standard_id', '90000000-0000-0000-0000-000000000001')
    .is('parent_id', null)
    .order('sort_order')

  return <RequirementsContent clauses={clauses || []} locale={locale} />
}

function RequirementsContent({
  clauses,
  locale,
}: {
  clauses: Array<{
    id: string
    number: string
    title: string
    title_en: string | null
    title_ar: string | null
    title_so: string | null
    requirements: Array<{
      id: string
      code: string
      statement: string
      statement_en: string | null
      statement_ar: string | null
      statement_so: string | null
      explain_novice: string | null
      explain_novice_en: string | null
      expected_evidence: unknown
      default_period: string | null
      default_role: string
      is_mandatory_doc: boolean
      is_mandatory_record: boolean
    }>
  }>
  locale: string
}) {
  const t = useTranslations('Requirements')
  const tRoles = useTranslations('Roles')

  const getTitle = (clause: {
    title: string
    title_en: string | null
    title_ar: string | null
    title_so: string | null
  }) => {
    switch (locale) {
      case 'en':
        return clause.title_en || clause.title
      case 'ar':
        return clause.title_ar || clause.title
      case 'so':
        return clause.title_so || clause.title
      default:
        return clause.title
    }
  }

  const getStatement = (req: {
    statement: string
    statement_en: string | null
    statement_ar: string | null
    statement_so: string | null
  }) => {
    switch (locale) {
      case 'en':
        return req.statement_en || req.statement
      case 'ar':
        return req.statement_ar || req.statement
      case 'so':
        return req.statement_so || req.statement
      default:
        return req.statement
    }
  }

  const getExplanation = (req: {
    explain_novice: string | null
    explain_novice_en: string | null
  }) => {
    if (locale === 'en' && req.explain_novice_en) return req.explain_novice_en
    return req.explain_novice
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {clauses.map((clause) => (
        <Card key={clause.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="secondary">{clause.number}</Badge>
              {getTitle(clause)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {clause.requirements.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              clause.requirements.map((req) => (
                <div key={req.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium">{getStatement(req)}</p>
                      {getExplanation(req) && (
                        <p className="mt-2 text-sm text-muted-foreground">{getExplanation(req)}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      {req.is_mandatory_doc && (
                        <Badge variant="destructive" className="whitespace-nowrap">
                          <ShieldAlert className="me-1 h-3 w-3" />
                          {t('mandatoryDoc')}
                        </Badge>
                      )}
                      {req.is_mandatory_record && (
                        <Badge variant="outline" className="whitespace-nowrap">
                          <FileText className="me-1 h-3 w-3" />
                          {t('mandatoryRecord')}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                    {req.default_period && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t('periodicity')}: {req.default_period}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {t('responsible')}: {tRoles(req.default_role as never)}
                    </span>
                    {Array.isArray(req.expected_evidence) &&
                      (req.expected_evidence as string[]).length > 0 && (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {t('evidence')}: {(req.expected_evidence as string[]).join(', ')}
                        </span>
                      )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
