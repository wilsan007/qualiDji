import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { MailCheck } from 'lucide-react'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  return <VerifyEmailContent />
}

function VerifyEmailContent() {
  const t = useTranslations('Auth')

  return (
    <Card>
      <CardHeader className="space-y-3 text-center">
        <div className="flex justify-center">
          <MailCheck className="h-10 w-10 text-primary" />
        </div>
        <div>
          <CardTitle className="text-2xl">{t('verifyEmailTitle')}</CardTitle>
          <CardDescription className="mt-2">{t('verifyEmailDescription')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="text-center">
        <Link href="/auth/login" className="text-sm font-medium text-primary hover:underline">
          {t('backToLogin')}
        </Link>
      </CardContent>
    </Card>
  )
}
