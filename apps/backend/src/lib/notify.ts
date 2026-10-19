import { supabaseAdmin } from './supabase'

/**
 * Module G — Notifications internes (V5 §5.7).
 * - Clé d'idempotence par destinataire : un même événement ne notifie jamais
 *   deux fois le même utilisateur (unique (user_id, dedupe_key)).
 * - Fire-and-forget : un échec de notification ne doit jamais faire échouer
 *   l'opération métier — il est loggé en console pour investigation.
 * - Pas de données sensibles dans title/body (§5.7) : identifiants et libellés
 *   courts uniquement, le lien profond renvoie vers une route protégée.
 */

export interface NotifyInput {
  tenantId: string
  /** Type d'événement : action.assigned, workflow.approved, nc.created… */
  kind: string
  /** Clé d'idempotence stable pour l'événement (ex. `workflow.approved:WF_X:v1`). */
  dedupeKey: string
  title: string
  body?: string
  /** Route frontend (lien profond), ex. `/workflow/<id>`. */
  link?: string
  entity?: string
  entityId?: string
  /** Acteurs à ne pas notifier (pas d'auto-notification). */
  excludeUserIds?: (string | undefined | null)[]
}

async function insertForUsers(userIds: string[], input: NotifyInput): Promise<void> {
  const excluded = new Set(input.excludeUserIds ?? [])
  const targets = userIds.filter((uid) => !excluded.has(uid))
  if (!targets.length) return
  const rows = targets.map((uid) => ({
    tenant_id: input.tenantId,
    user_id: uid,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    entity: input.entity ?? null,
    entity_id: input.entityId ?? null,
    link: input.link ?? null,
    dedupe_key: `${input.kind}:${input.dedupeKey}:${uid}`,
  }))
  const { error } = await supabaseAdmin.from('notifications').upsert(rows, {
    onConflict: 'user_id,dedupe_key',
    ignoreDuplicates: true, // idempotence : la seconde occurrence est ignorée
  })
  if (error) console.error('[notify] insert failed:', error.message)
}

/** Notifie les utilisateurs porteurs de l'un des rôles indiqués (même tenant). */
export async function notifyByRoles(roles: string[], input: NotifyInput): Promise<void> {
  try {
    const { data: profiles, error } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('tenant_id', input.tenantId)
      .in('role', roles)
      .eq('is_active', true)
    if (error) {
      console.error('[notify] role lookup failed:', error.message)
      return
    }
    await insertForUsers((profiles ?? []).map((p) => p.id), input)
  } catch (e: any) {
    console.error('[notify] notifyByRoles failed:', e?.message)
  }
}

/** Notifie des utilisateurs ciblés (ids). */
export async function notifyUsers(userIds: (string | undefined | null)[], input: NotifyInput): Promise<void> {
  const ids = userIds.filter((id): id is string => Boolean(id))
  try {
    await insertForUsers(ids, input)
  } catch (e: any) {
    console.error('[notify] notifyUsers failed:', e?.message)
  }
}
