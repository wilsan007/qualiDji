'use client'

import { useLocale } from 'next-intl'
import { useRouter, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { Globe, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { locales, localeLabels, type Locale } from '@/i18n/routing'
import { cn } from '@/lib/utils'

export function LanguageSwitcher() {
  const locale = useLocale() as Locale
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function switchTo(newLocale: Locale) {
    if (newLocale === locale) return

    startTransition(() => {
      // Replace the locale segment in the path
      const segments = pathname.split('/')
      if (segments[1] && locales.includes(segments[1] as Locale)) {
        segments[1] = newLocale
      } else {
        segments.splice(1, 0, newLocale)
      }
      router.push(segments.join('/') || `/${newLocale}`)
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={isPending} className="gap-2">
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">{localeLabels[locale].flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => switchTo(l)}
            className={cn('flex items-center gap-2', l === locale && 'font-semibold')}
          >
            <span>{localeLabels[l].flag}</span>
            <span>{localeLabels[l].name}</span>
            {l === locale && <Check className="ms-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
