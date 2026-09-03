import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { LoginContent } from './login-content'

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
      <LoginContent />
    </Suspense>
  )
}
