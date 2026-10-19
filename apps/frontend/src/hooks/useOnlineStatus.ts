import { useEffect, useState } from 'react'
import { offlineQueue, QUEUE_CHANGED_EVENT } from '../lib/offline/db'

/** État réseau + nombre de mutations en attente de rejeu (§13). */
export function useOnlineStatus(): { online: boolean; pending: number } {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    const refresh = () => {
      void offlineQueue.size().then(setPending)
    }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh)
    refresh()
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      window.removeEventListener(QUEUE_CHANGED_EVENT, refresh)
    }
  }, [])

  return { online, pending }
}
