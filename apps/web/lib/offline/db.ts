import Dexie, { type Table } from 'dexie'

export interface QueuedAction {
  id?: number
  type: 'task_submit' | 'evidence_upload' | 'task_start' | 'task_verify'
  taskId?: string
  payload: unknown
  status: 'pending' | 'syncing' | 'synced' | 'failed'
  attempts: number
  createdAt: number
  syncedAt?: number
  error?: string
}

export interface CachedTask {
  id: string
  title: string
  status: string
  priority: string
  due_date: string
  evidence_level_min: string
  instructions?: string | null
  description?: string | null
  cachedAt: number
}

class QualiDjiDB extends Dexie {
  queuedActions!: Table<QueuedAction, number>
  cachedTasks!: Table<CachedTask, string>

  constructor() {
    super('qualidji')
    this.version(1).stores({
      queuedActions: '++id, type, status, createdAt',
      cachedTasks: 'id, status, due_date, cachedAt',
    })
  }
}

export const db = new QualiDjiDB()

// Queue an action for offline sync
export async function queueAction(
  type: QueuedAction['type'],
  payload: unknown,
  taskId?: string,
): Promise<number> {
  return await db.queuedActions.add({
    type,
    payload,
    taskId,
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
  })
}

// Get all pending actions
export async function getPendingActions(): Promise<QueuedAction[]> {
  return await db.queuedActions.where('status').anyOf(['pending', 'failed']).toArray()
}

// Mark action as synced
export async function markSynced(id: number): Promise<void> {
  await db.queuedActions.update(id, {
    status: 'synced',
    syncedAt: Date.now(),
  })
}

// Mark action as failed
export async function markFailed(id: number, error: string): Promise<void> {
  await db.queuedActions.update(id, {
    status: 'failed',
    error,
    attempts: await db.queuedActions.get(id).then((a) => (a?.attempts || 0) + 1),
  })
}

// Clean up synced actions older than 24 hours
export async function cleanupSyncedActions(): Promise<void> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  await db.queuedActions.where('status').equals('synced').and((a) => (a.syncedAt || 0) < cutoff).delete()
}

// Cache tasks for offline access
export async function cacheTasks(tasks: CachedTask[]): Promise<void> {
  await db.cachedTasks.bulkPut(tasks.map((t) => ({ ...t, cachedAt: Date.now() })))
}

// Get cached tasks
export async function getCachedTasks(): Promise<CachedTask[]> {
  return await db.cachedTasks.orderBy('due_date').toArray()
}

// Clear all cached data
export async function clearCache(): Promise<void> {
  await db.cachedTasks.clear()
}
