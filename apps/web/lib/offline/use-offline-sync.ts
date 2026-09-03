'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { getPendingActions, markSynced, markFailed, cleanupSyncedActions } from './db'

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'synced' | 'error'

export function useOfflineSync() {
  const t = useTranslations('Offline')
  const [isOnline, setIsOnline] = useState(true)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('online')
  const [pendingCount, setPendingCount] = useState(0)

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      setSyncStatus('syncing')
      syncPendingActions()
    }
    const handleOffline = () => {
      setIsOnline(false)
      setSyncStatus('offline')
    }

    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check pending count on mount
    checkPendingCount()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const checkPendingCount = useCallback(async () => {
    const pending = await getPendingActions()
    setPendingCount(pending.length)
  }, [])

  const syncPendingActions = useCallback(async () => {
    const pending = await getPendingActions()
    if (pending.length === 0) {
      setSyncStatus('synced')
      return
    }

    setSyncStatus('syncing')
    const supabase = createClient()

    for (const action of pending) {
      try {
        switch (action.type) {
          case 'task_start': {
            const { error } = await supabase
              .from('tasks')
              .update({ status: 'in_progress', started_at: new Date().toISOString() })
              .eq('id', action.taskId)
            if (error) throw error
            await markSynced(action.id!)
            break
          }
          case 'task_submit': {
            const payload = action.payload as {
              comment: string
              evidence: Array<{ name: string; hash: string; storagePath: string }>
            }
            const {
              data: { user },
            } = await supabase.auth.getUser()
            if (!user) throw new Error('Not authenticated')

            // Upload evidence
            for (const ev of payload.evidence) {
              await supabase.from('evidence').insert({
                task_id: action.taskId,
                uploaded_by: user.id,
                type: 'document',
                storage_path: ev.storagePath,
                file_name: ev.name,
                file_hash: ev.hash,
                level: '2',
              })
            }

            // Create completion
            await supabase.from('task_completions').insert({
              task_id: action.taskId,
              user_id: user.id,
              comment: payload.comment,
            })

            // Update task
            await supabase
              .from('tasks')
              .update({ status: 'submitted', submitted_at: new Date().toISOString() })
              .eq('id', action.taskId)

            await markSynced(action.id!)
            break
          }
          case 'task_verify': {
            const payload = action.payload as { approved: boolean; comment: string }
            const {
              data: { user },
            } = await supabase.auth.getUser()
            if (!user) throw new Error('Not authenticated')

            await supabase.from('task_verifications').insert({
              task_id: action.taskId,
              verifier_id: user.id,
              status: payload.approved ? 'approved' : 'rejected',
              comment: payload.comment,
            })

            await supabase
              .from('tasks')
              .update({
                status: payload.approved ? 'verified' : 'rejected',
                verified_at: new Date().toISOString(),
                verified_by: user.id,
                rejection_reason: payload.approved ? null : payload.comment,
              })
              .eq('id', action.taskId)

            await markSynced(action.id!)
            break
          }
        }
      } catch (err) {
        await markFailed(action.id!, err instanceof Error ? err.message : 'Unknown error')
        setSyncStatus('error')
      }
    }

    await cleanupSyncedActions()
    await checkPendingCount()
    if (pending.length > 0) setSyncStatus('synced')
  }, [checkPendingCount])

  return {
    isOnline,
    syncStatus,
    pendingCount,
    syncNow: syncPendingActions,
    label: isOnline ? t('online') : t('offline'),
  }
}
