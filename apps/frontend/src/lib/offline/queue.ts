/**
 * §13 — Mode hors ligne : file d'attente de mutations idempotente.
 * - FIFO strict : le premier échec stoppe le flush (l'ordre métier est préservé).
 * - Clé d'idempotence PAR OPÉRATION MÉTIER (ex. `step.submit:<action>:<step>`) :
 *   un rejeu rejoue la même opération, jamais deux — combiné à l'upsert unique
 *   (action_id, step_id) côté serveur, le rejeu est sans effet de bord.
 * - M9 — file LIÉE À L'UTILISATEUR : chaque mutation porte le user_id de son
 *   auteur ; le replay n'envoie que les mutations de l'utilisateur courant (les
 *   saisies d'un autre compte ne sont jamais rejouées sous une fausse identité)
 *   et la déconnexion vide la file (clearForUser / clear).
 * - Storage injectable : persistance Dexie côté navigateur, Map en test.
 */

export interface PendingMutation {
  id: string
  kind: string
  payload: unknown
  idempotency_key: string
  /** M9 : auteur de la saisie — la file n'est jamais rejouée sous une autre identité. */
  user_id?: string | null
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
  /** M9 : mutations d'un autre compte, laissées en file sans envoi. */
  foreign: number
}

/** La file hors ligne est pleine : la saisie n'est pas enregistrée (aucune mutation plus ancienne n'est perdue). */
export class OfflineQueueFullError extends Error {
  constructor(public readonly max: number) {
    super(`File hors ligne pleine (${max} saisies en attente) — reconnectez-vous pour synchroniser avant de continuer.`)
    this.name = 'OfflineQueueFullError'
  }
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
    /** M9 : identité courante (null si inconnue) — les mutations d'un autre compte ne partent jamais. */
    private readonly getUserId: () => string | null | undefined = () => null,
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
    const userId = this.getUserId() ?? null
    const existing = items.find((m) => m.idempotency_key === idempotencyKey)
    if (existing) {
      existing.payload = payload
      existing.user_id = userId
      await this.persist()
      return existing
    }
    const mutation: PendingMutation = {
      id: localId(),
      kind,
      payload,
      idempotency_key: idempotencyKey,
      user_id: userId,
      created_at: Date.now(),
      attempts: 0,
    }
    // M9 : jamais d'éviction silencieuse — une file pleine refuse la nouvelle saisie (l'utilisateur est prévenu).
    if (items.length >= this.max) throw new OfflineQueueFullError(this.max)
    items.push(mutation)
    await this.persist()
    return mutation
  }

  async size(): Promise<number> {
    return (await this.items()).length
  }

  async list(): Promise<PendingMutation[]> {
    return [...(await this.items())]
  }

  /**
   * M9 — vide les mutations d'un utilisateur donné (déconnexion) ; sans argument,
   * vide toute la file. Les saisies ne traversent jamais un changement de compte.
   */
  async clear(userId?: string): Promise<void> {
    const items = await this.items()
    const kept = userId === undefined ? [] : items.filter((m) => m.user_id !== userId)
    this.cache = kept
    await this.persist()
  }

  /** Envoie tout, dans l'ordre. Premier échec → stop (l'item reste en file). */
  async flush(): Promise<FlushResult> {
    const items = await this.items()
    const current = this.getUserId() ?? null
    const backlog: PendingMutation[] = [] // M9 : mutations d'un autre compte — jamais envoyées
    const mine: PendingMutation[] = []
    for (const m of items) {
      // Identité inconnue (null) : comportement historique — l'envoi échouera en 401
      // sans jeton, l'item reste en file. Identité connue : seules SES mutations partent.
      if (current === null || m.user_id === current) mine.push(m)
      else backlog.push(m)
    }
    let sent = 0
    let failed = 0
    while (mine.length) {
      const head = mine[0]
      head.attempts += 1
      try {
        await this.send(head)
        mine.shift()
        sent++
      } catch {
        failed++
        break // ordre préservé : on ne saute jamais un item bloquant
      }
    }
    this.cache = [...mine, ...backlog]
    await this.persist()
    return { sent, failed, remaining: this.cache.length, foreign: backlog.length }
  }
}
