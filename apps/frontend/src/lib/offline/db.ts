import Dexie from 'dexie'
import { OfflineQueue, PendingMutation, QueueStorage } from './queue'

/**
 * §13 — Persistance Dexie de la file hors ligne (navigateur uniquement).
 * Le rejeu utilise l'API existante : step_submissions est un upsert unique
 * (action_id, step_id) → rejeu idempotent côté serveur sans contrat nouveau.
 */

const db = new Dexie('qualidji-offline')
db.version(1).stores({ pending: 'id, kind, created_at' })

const dexieStorage: QueueStorage = {
  async load(): Promise<PendingMutation[]> {
    try {
      return await db.table('pending').orderBy('created_at').toArray()
    } catch {
      return []
    }
  },
  async save(items) {
    try {
      await db.table('pending').clear()
      if (items.length) await db.table('pending').bulkPut(items)
    } catch {
      /* stockage indisponible (mode privé) — la queue vit en mémoire */
    }
  },
}

/** Envoi d'une mutation rejouée — dispatch vers l'API existante. */
async function sendMutation(m: PendingMutation): Promise<void> {
  const { apiFetch } = await import('../api')
  const p = m.payload as { actionId: string; stepId: string; value: unknown }
  if (m.kind === 'step.submit') {
    await apiFetch(`/steps/${p.actionId}/steps/${p.stepId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ value: p.value }),
    })
    return
  }
  throw new Error(`kind hors ligne inconnu: ${m.kind}`)
}

export const offlineQueue = new OfflineQueue(dexieStorage, sendMutation)

/** Événement global « la file a changé » (UI badge). */
export const QUEUE_CHANGED_EVENT = 'qualidji:queue-changed'

export function emitQueueChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT))
}

/** Lance le replay automatique au retour du réseau (idempotent, sans doublon). */
export function installOfflineSync(): void {
  if (typeof window === 'undefined') return
  const replay = () => {
    void offlineQueue.flush().then((r) => {
      if (r.sent > 0 || r.failed === 0) emitQueueChanged()
    })
  }
  window.addEventListener('online', replay)
  // Rejeu périodique léger si la file n'est pas vide (reprise après crash onglet)
  window.setInterval(replay, 60_000)
  replay()
}
