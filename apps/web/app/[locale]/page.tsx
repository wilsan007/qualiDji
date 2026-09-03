import { setRequestLocale } from 'next-intl/server'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ShieldCheck, FileCheck, Camera, Brain, Users, Globe } from 'lucide-react'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { Button } from '@/components/ui/button'

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  return <HomeContent />
}

function HomeContent() {
  const t = useTranslations('Home')
  const tNav = useTranslations('Nav')

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">QualiDji</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link
              href="/auth/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {tNav('login')}
            </Link>
            <Link href="/auth/register">
              <Button size="sm">{tNav('register')}</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="border-b py-20">
          <div className="container mx-auto max-w-4xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              {t('heroTitle')}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              {t('heroDescription')}
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link href="/auth/register">
                <Button size="lg">{t('startFree')}</Button>
              </Link>
              <Link href="/auth/login">
                <Button variant="outline" size="lg">
                  {t('login')}
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20">
          <div className="container mx-auto max-w-6xl">
            <h2 className="text-center text-3xl font-bold">{t('featuresTitle')}</h2>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              <FeatureCard
                icon={FileCheck}
                title={t('featureEngine.title')}
                description={t('featureEngine.description')}
              />
              <FeatureCard
                icon={Camera}
                title={t('featureEvidence.title')}
                description={t('featureEvidence.description')}
              />
              <FeatureCard
                icon={Brain}
                title={t('featureAdaptive.title')}
                description={t('featureAdaptive.description')}
              />
              <FeatureCard
                icon={Users}
                title={t('featureAuditors.title')}
                description={t('featureAuditors.description')}
              />
              <FeatureCard
                icon={Globe}
                title={t('featureDjibouti.title')}
                description={t('featureDjibouti.description')}
              />
              <FeatureCard
                icon={ShieldCheck}
                title={t('featureAntiCheat.title')}
                description={t('featureAntiCheat.description')}
              />
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container text-center text-sm text-muted-foreground">
          <p>{t('footerTagline')}</p>
          <p className="mt-1">{t('footerSubtitle')}</p>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border p-6">
      <div className="mb-4 inline-flex rounded-md bg-primary/10 p-3">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
