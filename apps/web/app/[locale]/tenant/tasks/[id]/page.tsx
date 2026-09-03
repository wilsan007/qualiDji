import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TaskActions } from './task-actions'
import { Clock, ShieldAlert, FileText, CheckCircle2 } from 'lucide-react'

export default async function TaskDetailPage({
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

  const { data: task } = await supabase
    .from('tasks')
    .select(
      `id, title, description, instructions, status, priority, due_date,
       assigned_to, assigned_role, evidence_level_min, started_at, submitted_at,
       verified_at, verified_by, rejection_reason`,
    )
    .eq('id', id)
    .eq('tenant_id', membership?.tenant_id)
    .single()

  if (!task) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">Task not found</CardContent>
      </Card>
    )
  }

  // Fetch evidence for this task
  const { data: evidence } = await supabase
    .from('evidence')
    .select('id, type, file_name, file_hash, is_verified, level, captured_at, created_at')
    .eq('task_id', task.id)
    .order('created_at', { ascending: false })

  // Fetch verifications
  const { data: verifications } = await supabase
    .from('task_verifications')
    .select('id, status, comment, verified_at, verifier_id')
    .eq('task_id', task.id)
    .order('verified_at', { ascending: false })

  const isAssignedToMe = task.assigned_to === user?.id
  const canVerify = ['quality_manager', 'process_owner', 'tenant_admin', 'super_admin'].includes(
    membership?.role || '',
  )

  return (
    <TaskDetailContent
      task={task}
      evidence={evidence || []}
      verifications={verifications || []}
      isAssignedToMe={isAssignedToMe}
      canVerify={canVerify}
      locale={locale}
    />
  )
}

function TaskDetailContent({
  task,
  evidence,
  verifications,
  isAssignedToMe,
  canVerify,
  locale,
}: {
  task: {
    id: string
    title: string
    description: string | null
    instructions: string | null
    status: string
    priority: string
    due_date: string
    assigned_to: string | null
    evidence_level_min: string
    started_at: string | null
    submitted_at: string | null
    verified_at: string | null
    rejection_reason: string | null
  }
  evidence: Array<{
    id: string
    type: string
    file_name: string
    file_hash: string
    is_verified: boolean
    level: string
    captured_at: string
  }>
  verifications: Array<{
    id: string
    status: string
    comment: string | null
    verified_at: string
  }>
  isAssignedToMe: boolean
  canVerify: boolean
  locale: string
}) {
  const t = useTranslations('Tasks')
  const tEvidence = useTranslations('Evidence')

  const statusLabel: Record<string, string> = {
    pending: t('pending'),
    in_progress: t('inProgress'),
    submitted: t('submitted'),
    verified: t('verified'),
    rejected: t('rejected'),
    overdue: t('overdue'),
  }

  const isOverdue = task.status === 'overdue' || (task.status === 'pending' && new Date(task.due_date) < new Date())

  return (
    <div className="space-y-6">
      {/* Task header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{task.title}</h1>
          {task.description && <p className="mt-2 text-muted-foreground">{task.description}</p>}
        </div>
        <Badge variant={isOverdue ? 'destructive' : 'secondary'}>
          {statusLabel[task.status] || task.status}
        </Badge>
      </div>

      {/* Task metadata */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 py-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{t('dueDate')}</p>
            <p className="mt-1 flex items-center gap-1 text-sm font-medium">
              <Clock className="h-3 w-3" />
              {new Date(task.due_date).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('priority')}</p>
            <p className="mt-1 text-sm font-medium">{task.priority}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('evidenceLevel')}</p>
            <p className="mt-1 text-sm font-medium">N{task.evidence_level_min}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('status')}</p>
            <p className="mt-1 text-sm font-medium">{statusLabel[task.status]}</p>
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      {task.instructions && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('instructions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{task.instructions}</p>
          </CardContent>
        </Card>
      )}

      {/* Rejection reason */}
      {task.rejection_reason && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-destructive">
              <ShieldAlert className="h-5 w-5" />
              {t('rejectionReason')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{task.rejection_reason}</p>
          </CardContent>
        </Card>
      )}

      {/* Evidence list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            {tEvidence('title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {evidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tEvidence('notVerified')}</p>
          ) : (
            evidence.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{ev.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {tEvidence('capturedAt')}: {new Date(ev.captured_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">N{ev.level}</Badge>
                  {ev.is_verified ? (
                    <Badge variant="default">
                      <CheckCircle2 className="me-1 h-3 w-3" />
                      {tEvidence('verified')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{tEvidence('notVerified')}</Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      {(isAssignedToMe || canVerify) && (
        <TaskActions
          taskId={task.id}
          status={task.status}
          isAssignedToMe={isAssignedToMe}
          canVerify={canVerify}
          evidenceLevelMin={task.evidence_level_min}
          locale={locale}
        />
      )}

      {/* Verification history */}
      {verifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('verifiedBy')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {verifications.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm">
                <span>{new Date(v.verified_at).toLocaleString()}</span>
                <Badge variant={v.status === 'approved' ? 'default' : 'destructive'}>
                  {v.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
