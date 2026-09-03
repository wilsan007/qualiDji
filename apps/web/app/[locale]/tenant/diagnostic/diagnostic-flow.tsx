'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, CheckCircle2, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DiagnosticQuestion {
  id: string
  question: string
  question_en: string
  question_ar: string
  question_so: string
  help_text: string
  help_text_en: string
  sort_order: number
}

type Score = '0' | '1' | '2' | '3' | '4'

export function DiagnosticFlow({ locale }: { locale: string }) {
  const t = useTranslations('Diagnostic')
  const supabase = createClient()

  const [questions, setQuestions] = useState<DiagnosticQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [responses, setResponses] = useState<Record<string, Score>>({})
  const [submitting, setSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [assessmentId, setAssessmentId] = useState<string | null>(null)

  useEffect(() => {
    async function loadQuestions() {
      const { data } = await supabase
        .from('diagnostic_questions')
        .select('id, question, question_en, question_ar, question_so, help_text, help_text_en, sort_order')
        .eq('standard_id', '90000000-0000-0000-0000-000000000001')
        .order('sort_order')

      if (data) setQuestions(data)
      setLoading(false)
    }
    loadQuestions()
  }, [supabase])

  const getQuestionText = useCallback(
    (q: DiagnosticQuestion) => {
      switch (locale) {
        case 'en':
          return q.question_en || q.question
        case 'ar':
          return q.question_ar || q.question
        case 'so':
          return q.question_so || q.question
        default:
          return q.question
      }
    },
    [locale],
  )

  const getHelpText = useCallback(
    (q: DiagnosticQuestion) => {
      switch (locale) {
        case 'en':
          return q.help_text_en || q.help_text
        default:
          return q.help_text
      }
    },
    [locale],
  )

  async function handleSelectAnswer(score: Score) {
    if (!questions[currentIndex]) return
    const qId = questions[currentIndex].id
    setResponses((prev) => ({ ...prev, [qId]: score }))

    // Save response to database
    const { data: userData } = await supabase.auth.getUser()
    if (userData.user) {
      await supabase.from('diagnostic_responses').upsert({
        tenant_id: (await supabase.from('memberships').select('tenant_id').eq('user_id', userData.user.id).single()).data
          ?.tenant_id,
        question_id: qId,
        response: score,
        responded_by: userData.user.id,
      })
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    // Create assessment record
    const { data: userData } = await supabase.auth.getUser()
    if (userData.user) {
      const { data: membership } = await supabase
        .from('memberships')
        .select('tenant_id')
        .eq('user_id', userData.user.id)
        .single()

      if (membership) {
        const { data: assessment } = await supabase
          .from('assessments')
          .insert({
            tenant_id: membership.tenant_id,
            standard_id: '90000000-0000-0000-0000-000000000001',
            name: 'Diagnostic initial',
            type: 'diagnostic',
            closed_at: new Date().toISOString(),
            created_by: userData.user.id,
          })
          .select()
          .single()

        if (assessment) setAssessmentId(assessment.id)
      }
    }
    setSubmitting(false)
    setCompleted(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (completed) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <CardTitle className="text-2xl">{t('results')}</CardTitle>
            <CardDescription>{t('completedMessage')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-6 text-center">
              <p className="text-sm text-muted-foreground">{t('score')}</p>
              <p className="mt-2 text-5xl font-bold text-primary">
                {Math.round(
                  (Object.values(responses).reduce((a, b) => a + parseInt(b), 0) /
                    (questions.length * 4)) *
                    100,
                )}
                %
              </p>
            </div>
            <div className="flex gap-3">
              <Button className="flex-1" onClick={() => (window.location.href = `/${locale}/tenant/compliance`)}>
                {t('startImplementation')}
              </Button>
              <Button variant="outline" className="flex-1">
                {t('exportPdf')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t('noDiagnostic')}
        </CardContent>
      </Card>
    )
  }

  const currentQ = questions[currentIndex]
  const progress = ((currentIndex + 1) / questions.length) * 100

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{t('question', { current: currentIndex + 1, total: questions.length })}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Question card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl leading-relaxed">{getQuestionText(currentQ)}</CardTitle>
          {getHelpText(currentQ) && (
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="mt-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <HelpCircle className="h-4 w-4" />
              {t('help')}
            </button>
          )}
          {showHelp && getHelpText(currentQ) && (
            <p className="mt-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              {getHelpText(currentQ)}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">{t('selectAnswer')}</p>
          {(['0', '1', '2', '3', '4'] as Score[]).map((score) => (
            <button
              key={score}
              onClick={() => handleSelectAnswer(score)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border p-4 text-start transition-colors',
                responses[currentQ.id] === score
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-accent',
              )}
            >
              <div
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                  responses[currentQ.id] === score
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/30',
                )}
              >
                {responses[currentQ.id] === score && <CheckCircle2 className="h-4 w-4" />}
              </div>
              <span className="text-sm">{t(`answers.${score}`)}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="me-2 h-4 w-4 ltr-flip" />
          {t('previous')}
        </Button>
        {currentIndex === questions.length - 1 ? (
          <Button onClick={handleSubmit} disabled={submitting || Object.keys(responses).length < questions.length}>
            {submitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('submit')}
          </Button>
        ) : (
          <Button
            onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
            disabled={!responses[currentQ.id]}
          >
            {t('next')}
            <ChevronRight className="ms-2 h-4 w-4 ltr-flip" />
          </Button>
        )}
      </div>
    </div>
  )
}
