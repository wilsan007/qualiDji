import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sparkles, MessageSquare, Plus, FileText, Target, GitBranch, BookOpen, Languages, ClipboardCheck, Send } from 'lucide-react'

export default async function AssistantPage({
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

  let conversations: any[] = []
  let usage: any = null

  if (membership) {
    const { data } = await supabase
      .from('ai_conversations')
      .select('id, role, context_type, title, is_active, created_at, updated_at')
      .eq('tenant_id', membership.tenant_id)
      .eq('user_id', user?.id)
      .order('updated_at', { ascending: false })
      .limit(20)
    if (data) conversations = data

    const { data: usageData } = await supabase
      .from('ai_usage_log')
      .select('total_tokens, cost_usd')
      .eq('tenant_id', membership.tenant_id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    if (usageData) {
      usage = {
        requests: usageData.length,
        tokens: usageData.reduce((sum: number, u: any) => sum + (u.total_tokens || 0), 0),
        cost: usageData.reduce((sum: number, u: any) => sum + (u.cost_usd || 0), 0),
      }
    }
  }

  return <AssistantContent conversations={conversations} usage={usage} />
}

function AssistantContent({
  conversations,
  usage,
}: {
  conversations: any[]
  usage: any
}) {
  const t = useTranslations('Assistant')

  const roleIcons: Record<string, any> = {
    general: Sparkles,
    writer: FileText,
    gap_analyst: Target,
    rca_coach: GitBranch,
    explainer: BookOpen,
    translator: Languages,
    audit_preparer: ClipboardCheck,
    haccp_assistant: Sparkles,
  }

  const roles = [
    { key: 'general', icon: Sparkles },
    { key: 'writer', icon: FileText },
    { key: 'gap_analyst', icon: Target },
    { key: 'rca_coach', icon: GitBranch },
    { key: 'explainer', icon: BookOpen },
    { key: 'translator', icon: Languages },
    { key: 'audit_preparer', icon: ClipboardCheck },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="h-6 w-6 text-primary" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
      </div>

      {/* Usage stats */}
      {usage && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">{t('requestsThisMonth')}</p>
              <p className="text-2xl font-bold">{usage.requests}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">{t('tokensUsed')}</p>
              <p className="text-2xl font-bold">{usage.tokens.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">{t('estimatedCost')}</p>
              <p className="text-2xl font-bold">${usage.cost.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Role selection */}
      <Card>
        <CardHeader>
          <CardTitle>{t('chooseRole')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {roles.map((r) => {
              const Icon = r.icon
              return (
                <Button
                  key={r.key}
                  variant="outline"
                  className="flex h-auto flex-col items-center gap-2 py-4"
                >
                  <Icon className="h-6 w-6 text-primary" />
                  <span className="text-xs font-medium text-center">
                    {t(`roles.${r.key}` as never)}
                  </span>
                </Button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick start prompt */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            {t('quickStart')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t('askPlaceholder')}
              className="flex-1 rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <Button size="sm">
              <Send className="me-2 h-4 w-4" />
              {t('send')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {['askExplainClause', 'askWriteProcedure', 'askRCA', 'askAuditPrep'].map((key) => (
              <Badge key={key} variant="outline" className="cursor-pointer hover:bg-accent">
                {t(`suggestions.${key}` as never)}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent conversations */}
      {conversations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {t('recentConversations')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {conversations.map((conv) => {
              const Icon = roleIcons[conv.role] || Sparkles
              return (
                <div
                  key={conv.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-primary" />
                    <div>
                      <p className="font-medium">{conv.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(`roles.${conv.role}` as never)} ·{' '}
                        {new Date(conv.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost">
                    {t('continue')}
                  </Button>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <p className="text-center text-xs text-muted-foreground">
        {t('disclaimer')}
      </p>
    </div>
  )
}
