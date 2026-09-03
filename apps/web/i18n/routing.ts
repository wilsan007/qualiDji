import { defineRouting } from 'next-intl/routing'

export const locales = ['fr', 'en', 'ar', 'so'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'fr'

export const localeLabels: Record<Locale, { name: string; flag: string; dir: 'ltr' | 'rtl' }> = {
  fr: { name: 'Français', flag: '🇫🇷', dir: 'ltr' },
  en: { name: 'English', flag: '🇬🇧', dir: 'ltr' },
  ar: { name: 'العربية', flag: '🇩🇿', dir: 'rtl' },
  so: { name: 'Soomaali', flag: '🇸🇴', dir: 'ltr' },
}

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
})
