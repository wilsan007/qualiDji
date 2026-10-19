/**
 * §13 — Mode hors ligne : file d'attente de mutations idempotente.
 * - FIFO strict : le premier échec stoppe le flush (l'ordre métier est préservé).
 * - Clé d'idempotence PAR OPÉRATION MÉTIER (ex. `step.submit:<action>:<step>`) :
 *   un rejeu rejoue la même opération, jamais deux — combiné à l'upsert unique
 *   (action_id, step_id) côté serveur, le rejeu est sans effet de bord.
 * - Storage injectable : persistance Dexie côté navigateur, Map en test.
 */

export interface PendingMutation {
  id: string
  kind: string
  payload: unknown
  idempotency_key: string
  created_at: number
  attempts: number
}

export interface QueueStorage {
  load(): Promise<PendingMutation[]>
  save(items: PendingMutation[]): Promise<void>
}

export interface FlushResult {
  sent: number
  failed: number
  remaining: number
}

let seq = 0
function localId(): string {
  seq += 1
  return `m_${Date.now().toString(36)}_${seq}`
}

export class OfflineQueue {
  private cache: PendingMutation[] | null = null

  constructor(
    private readonly storage: QueueStorage,
    private readonly send: (m: PendingMutation) => Promise<void>,
    private readonly max = 50,
  ) {}

  private async items(): Promise<PendingMutation[]> {
    if (!this.cache) this.cache = await this.storage.load()
    return this.cache
  }

  private async persist(): Promise<void> {
    if (this.cache) await this.storage.save(this.cache)
  }

  /** Ajoute (ou remplace) par clé d'idempotence — pas de doublon d'opération. */
  async enqueue(kind: string, payload: unknown, idempotencyKey: string): Promise<PendingMutation> {
    const items = await this.items()
    const existing = items.find((m) => m.idempotency_key === idempotencyKey)
    if (existing) {
      existing.payload = payload
      await this.persist()
      return existing
    }
    const mutation: PendingMutation = {
      id: localId(),
      kind,
      payload,
      idempotency_key: idempotencyKey,
      created_at: Date.now(),
      attempts: 0,
    }
    items.push(mutation)
    if (items.length > this.max) items.splice(0, items.length - this.max)
    await this.persist()
    return mutation
  }

  async size(): Promise<number> {
    return (await this.items()).length
  }

  async list(): Promise<PendingMutation[]> {
    return [...(await this.items())]
  }

  /** Envoie tout, dans l'ordre. Premier échec → stop (l'item reste en file). */
  async flush(): Promise<FlushResult> {
    const items = await this.items()
    let sent = 0
    let failed = 0
    while (items.length) {
      const head = items[0]
      head.attempts += 1
      try {
        await this.send(head)
        items.shift()
        sent++
      } catch {
        failed++
        break // ordre préservé : on ne saute jamais un item bloquant
      }
    }
    this.cache = items
    await this.persist()
    return { sent, failed, remaining: items.length }
  }
}
