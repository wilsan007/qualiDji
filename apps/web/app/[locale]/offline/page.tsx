import { useTranslations } from 'next-intl'

export default function OfflinePage() {
  const t = useTranslations('Offline')

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8 text-center">
      <div className="mx-auto max-w-md space-y-4">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-10 w-10 text-muted-foreground"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9.75v6.75m0 0l-3-3m3 3l3-3m-8.25 6a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 20.25H6.75z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold">{t('offlineMode')}</h1>
        <p className="text-muted-foreground">{t('offlineDesc')}</p>
        <p className="text-sm text-muted-foreground">{t('cachedData')}</p>
      </div>
    </div>
  )
}
