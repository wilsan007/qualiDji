'use client'

import { useOfflineSync } from '@/lib/offline/use-offline-sync'
import { useTranslations } from 'next-intl'
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function OfflineIndicator() {
  const { isOnline, syncStatus, pendingCount, syncNow } = useOfflineSync()
  const t = useTranslations('Offline')

  if (isOnline && pendingCount === 0 && syncStatus !== 'syncing') {
    return null // Don't show anything when online and synced
  }

  return (
    <button
      onClick={syncNow}
      className={cn(
        'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
        syncStatus === 'offline' && 'bg-muted text-muted-foreground',
        syncStatus === 'syncing' && 'bg-primary/10 text-primary',
        syncStatus === 'synced' && 'bg-success/10 text-success',
        syncStatus === 'error' && 'bg-destructive/10 text-destructive',
      )}
    >
      {syncStatus === 'offline' && (
        <>
          <WifiOff className="h-3 w-3" />
          {t('offline')}
          {pendingCount > 0 && ` · ${pendingCount}`}
        </>
      )}
      {syncStatus === 'syncing' && (
        <>
          <RefreshCw className="h-3 w-3 animate-spin" />
          {t('syncing')}
        </>
      )}
      {syncStatus === 'synced' && (
        <>
          <CheckCircle2 className="h-3 w-3" />
          {t('synced')}
        </>
      )}
      {syncStatus === 'error' && (
        <>
          <AlertCircle className="h-3 w-3" />
          {t('syncFailed')} · {t('retrySync')}
        </>
      )}
      {syncStatus === 'online' && pendingCount > 0 && (
        <>
          <Wifi className="h-3 w-3" />
          {t('pendingSync')} · {pendingCount}
        </>
      )}
    </button>
  )
}
