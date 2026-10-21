import { describe, it, expect, vi } from 'vitest'
import { OfflineQueue, type PendingMutation, type QueueStorage } from '@/lib/offline/queue'

/** Storage en mémoire (Map) : même contrat que la persistance Dexie navigateur. */
function memoryStorage(initial: PendingMutation[] = []): QueueStorage & { items: PendingMutation[] } {
  const items = [...initial]
  return {
    items,
    async load() {
      return [...items]
    },
    async save(next) {
      items.length = 0
      items.push(...next)
    },
  }
}

describe('§13 — file hors ligne (OfflineQueue)', () => {
  it('enqueue une mutation avec une clé d idempotence', async () => {
    const storage = memoryStorage()
    const send = vi.fn(async () => {})
    const queue = new OfflineQueue(storage, send)

    const m = await queue.enqueue('step.submit', { value: 1 }, 'step.submit:A:1')
    expect(m.kind).toBe('step.submit')
    expect(m.attempts).toBe(0)
    expect(m.idempotency_key).toBe('step.submit:A:1')
    expect(await queue.size()).toBe(1)
  })

  it('ne duplique pas une opération déjà en file (rejeu idempotent)', async () => {
    const storage = memoryStorage()
    const queue = new OfflineQueue(storage, async () => {})

    await queue.enqueue('step.submit', { value: 1 }, 'step.submit:A:1')
    const again = await queue.enqueue('step.submit', { value: 2 }, 'step.submit:A:1')

    expect(await queue.size()).toBe(1)
    // La payload est mise à jour, l opération reste unique
    expect(again.payload).toEqual({ value: 2 })
  })

  it('flush envoie dans l ordre FIFO et vide la file', async () => {
    const storage = memoryStorage()
    const sent: string[] = []
    const queue = new OfflineQueue(storage, async (m) => {
      sent.push(m.idempotency_key)
    })

    await queue.enqueue('step.submit', {}, 'a')
    await queue.enqueue('step.submit', {}, 'b')
    await queue.enqueue('step.submit', {}, 'c')

    const res = await queue.flush()
    expect(res).toEqual({ sent: 3, failed: 0, remaining: 0 })
    expect(sent).toEqual(['a', 'b', 'c'])
    expect(await queue.size()).toBe(0)
  })

  it('s arrête au premier échec (ordre métier préservé)', async () => {
    const storage = memoryStorage()
    const attempted: string[] = []
    const queue = new OfflineQueue(storage, async (m) => {
      attempted.push(m.idempotency_key)
      if (m.idempotency_key === 'b') throw new Error('échec réseau')
    })

    await queue.enqueue('step.submit', {}, 'a')
    await queue.enqueue('step.submit', {}, 'b')
    await queue.enqueue('step.submit', {}, 'c')

    const res = await queue.flush()
    expect(res.sent).toBe(1)
    expect(res.failed).toBe(1)
    expect(res.remaining).toBe(2)
    // 'c' n'a jamais été tentée : on ne saute pas l'item bloquant
    expect(attempted).toEqual(['a', 'b'])
  })

  it('incrémente les tentatives de l item bloqué', async () => {
    const storage = memoryStorage()
    const queue = new OfflineQueue(storage, async () => {
      throw new Error('échec')
    })
    await queue.enqueue('step.submit', {}, 'a')
    await queue.flush()
    const [item] = await queue.list()
    expect(item.attempts).toBe(1)
  })

  it('respecte la taille maximale de la file (50 par défaut)', async () => {
    const storage = memoryStorage()
    const queue = new OfflineQueue(storage, async () => {}, 3)
    for (const k of ['a', 'b', 'c', 'd']) await queue.enqueue('step.submit', {}, k)
    const items = await queue.list()
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.idempotency_key)).toEqual(['b', 'c', 'd'])
  })

  it('recharge la file depuis le storage (persistance après reload)', async () => {
    const storage = memoryStorage()
    await storage.save([
      { id: 'm1', kind: 'step.submit', payload: {}, idempotency_key: 'x', created_at: 1, attempts: 0 },
    ])
    const queue = new OfflineQueue(storage, async () => {})
    expect(await queue.size()).toBe(1)
  })
})
