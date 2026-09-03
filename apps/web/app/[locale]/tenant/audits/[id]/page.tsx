import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ClipboardCheck,
  Calendar,
  Users,
  FileCheck,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Target,
} from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function AuditDetailPage({
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

  const { data: audit } = await supabase
    .from('audit_cycles')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', membership.tenant_id)
    .single()

  if (!audit) notFound()

  const { data: checklists } = await supabase
    .from('audit_checklists')
    .select('id, name, auditor_id')
    .eq('cycle_id', id)

  let checklistItems: any[] = []
  if (checklists && checklists.length > 0) {
    const { data: items } = await supabase
      .from('audit_checklist_items')
      .select('*')
      .in(
        'checklist_id',
        checklists.map((c) => c.id),
      )
      .order('sort_order', { ascending: true })
    if (items) checklistItems = items
  }

  const { data: findings } = await supabase
    .from('audit_findings')
    .select('*')
    .eq('cycle_id', id)
    .order('created_at', { ascending: false })

  const { data: report } = await supabase
    .from('audit_reports')
    .select('*')
    .eq('cycle_id', id)
    .maybeSingle()

  const canManage = ['tenant_admin', 'quality_manager', 'internal_auditor', 'super_admin'].includes(
    membership.role,
  )

  return (
    <AuditDetailContent
      audit={audit}
      checklists={checklists || []}
      checklistItems={checklistItems}
      findings={findings || []}
      report={report}
      canManage={canManage}
    />
  )
}

function AuditDetailContent({
  audit,
  checklists,
  checklistItems,
  findings,
  report,
  canManage,
}: {
  audit: any
  checklists: any[]
  checklistItems: any[]
  findings: any[]
  report: any
  canManage: boolean
}) {
  const t = useTranslations('Audits')

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    planned: 'outline',
    scheduled: 'outline',
    in_progress: 'default',
    reporting: 'default',
    completed: 'default',
    cancelled: 'destructive',
  }

  const findingIcon: Record<string, any> = {
    conformity: CheckCircle2,
    minor_nc: AlertTriangle,
    major_nc: AlertTriangle,
    observation: Lightbulb,
    opportunity: Target,
  }

  const findingVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    conformity: 'default',
    minor_nc: 'secondary',
    major_nc: 'destructive',
    observation: 'outline',
    opportunity: 'outline',
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/tenant/audits"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {t('backToList')}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{audit.audit_number}</span>
                <Badge variant={statusVariant[audit.status] || 'outline'}>
                  {t(`status.${audit.status}` as never)}
                </Badge>
                <Badge variant="outline">
                  {t(`type.${audit.type}` as never)}
                </Badge>
              </div>
              <CardTitle className="mt-2">{audit.title}</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">{t('scope')}</p>
            <p className="text-sm text-muted-foreground">{audit.scope}</p>
          </div>

          {audit.objectives && (
            <div>
              <p className="text-sm font-medium">{t('objectives')}</p>
              <p className="text-sm text-muted-foreground">{audit.objectives}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {audit.scheduled_date && (
              <div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {t('scheduledDate')}
                </p>
                <p className="text-sm font-medium">
                  {new Date(audit.scheduled_date).toLocaleDateString()}
                </p>
              </div>
            )}
            {audit.start_date && audit.end_date && (
              <div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {t('auditPeriod')}
                </p>
                <p className="text-sm font-medium">
                  {new Date(audit.start_date).toLocaleDateString()} —{' '}
                  {new Date(audit.end_date).toLocaleDateString()}
                </p>
              </div>
            )}
            {audit.criteria && audit.criteria.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">{t('criteria')}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {audit.criteria.map((c: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            {t('checklist')} ({checklistItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {checklistItems.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noChecklistItems')}</p>
          )}
          {checklistItems.map((item) => {
            const Icon = findingIcon[item.finding_type] || FileCheck
            return (
              <div key={item.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      {item.clause_ref && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.clause_ref}
                        </span>
                      )}
                      <p className="text-sm font-medium">{item.question}</p>
                      {item.expected_evidence && (
                        <p className="text-xs text-muted-foreground">
                          {t('expectedEvidence')}: {item.expected_evidence}
                        </p>
                      )}
                      {item.finding_notes && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.finding_notes}
                        </p>
                      )}
                    </div>
                  </div>
                  {item.finding_type && (
                    <Badge variant={findingVariant[item.finding_type] || 'outline'}>
                      {t(`findingType.${item.finding_type}` as never)}
                    </Badge>
                  )}
                </div>
              </div>
            )
          })}
          {canManage && audit.status === 'planned' && (
            <Button size="sm" variant="outline" className="w-full">
              {t('addChecklistItem')}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Findings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            {t('findings')} ({findings.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {findings.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noFindings')}</p>
          )}
          {findings.map((f) => {
            const Icon = findingIcon[f.type] || AlertTriangle
            return (
              <div key={f.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-medium">
                          {f.finding_number}
                        </span>
                        <Badge variant={findingVariant[f.type] || 'outline'}>
                          {t(`findingType.${f.type}` as never)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm">{f.description}</p>
                      {f.recommendation && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('recommendation')}: {f.recommendation}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Report */}
      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              {t('report')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium">{t('executiveSummary')}</p>
              <p className="text-sm text-muted-foreground">{report.executive_summary}</p>
            </div>

            {report.overall_rating && (
              <div>
                <p className="text-sm font-medium">{t('overallRating')}</p>
                <Badge variant="default">
                  {t(`rating.${report.overall_rating}` as never)}
                </Badge>
              </div>
            )}

            {report.strengths && report.strengths.length > 0 && (
              <div>
                <p className="text-sm font-medium">{t('strengths')}</p>
                <ul className="mt-1 space-y-1">
                  {report.strengths.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.weaknesses && report.weaknesses.length > 0 && (
              <div>
                <p className="text-sm font-medium">{t('weaknesses')}</p>
                <ul className="mt-1 space-y-1">
                  {report.weaknesses.map((w: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.conclusions && (
              <div>
                <p className="text-sm font-medium">{t('conclusions')}</p>
                <p className="text-sm text-muted-foreground">{report.conclusions}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
