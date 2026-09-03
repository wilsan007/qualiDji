import { setRequestLocale } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { DiagnosticFlow } from './diagnostic-flow'

export default async function DiagnosticPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  return <DiagnosticContent locale={locale} />
}

function DiagnosticContent({ locale }: { locale: string }) {
  const t = useTranslations('Diagnostic')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>
      <DiagnosticFlow locale={locale} />
    </div>
  )
}
