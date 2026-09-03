'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ShieldCheck, Loader2, AlertCircle } from 'lucide-react'

export function InviteContent({ token }: { token: string }) {
  const router = useRouter()
  const t = useTranslations('Auth')
  const tRoles = useTranslations('Roles')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<{
    email: string
    role: string
    tenant_name: string
  } | null>(null)
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')

  useEffect(() => {
    async function checkInvitation() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('invitations')
        .select(`email, role, expires_at, accepted_at, tenants(name)`)
        .eq('token', token)
        .single()

      if (error || !data) {
        setError(t('inviteNotFound'))
        setLoading(false)
        return
      }

      if (data.accepted_at) {
        setError(t('inviteUsed'))
        setLoading(false)
        return
      }

      if (new Date(data.expires_at) < new Date()) {
        setError(t('inviteExpired'))
        setLoading(false)
        return
      }

      setInvitation({
        email: data.email,
        role: data.role,
        tenant_name: (data.tenants as unknown as { name: string }).name,
      })
      setLoading(false)
    }
    checkInvitation()
  }, [token, t])

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email: invitation!.email,
      password,
      options: {
        data: { full_name: fullName, invite_token: token },
      },
    })

    if (error) {
      setError(error.message)
      setSubmitting(false)
      return
    }

    if (data.user) {
      router.push('/auth/verify-email')
      router.refresh()
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
          </div>
          <CardTitle className="mt-3">{t('inviteInvalid')}</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const roleLabel = invitation ? tRoles(invitation.role as never) : ''

  return (
    <Card>
      <CardHeader className="space-y-3 text-center">
        <div className="flex justify-center">
          <ShieldCheck className="h-10 w-10 text-primary" />
        </div>
        <div>
          <CardTitle className="text-2xl">
            {t('inviteTitle', { tenant: invitation?.tenant_name })}
          </CardTitle>
          <CardDescription className="mt-2">
            {t('inviteDescription', { role: roleLabel })}
          </CardDescription>
        </div>
      </CardHeader>
      <form onSubmit={handleAccept}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">{t('fullName')}</Label>
            <Input
              id="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t('email')}</Label>
            <Input id="email" type="email" disabled value={invitation?.email || ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('setPassword')}</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('passwordPlaceholder')}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('acceptInvite')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
