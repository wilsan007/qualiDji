import { supabaseAdmin } from './supabase'

export interface AuditEntry {
  tenantId: string
  actorId: string
  action: string
  entity: string
  entityId: string
  payload?: Record<string, unknown>
}

/**
 * Écrit une ligne du journal d'audit et ATTEND le résultat : supabase-js ne lève
 * pas d'exception sur une erreur SQL, un `void insert(...)` perd donc
 * silencieusement l'évènement. Ici l'échec est au moins journalisé (stderr) et
 * renvoyé à l'appelant, qui décide s'il doit faire échouer l'opération.
 */
export async function writeAudit(entry: AuditEntry): Promise<boolean> {
  const { error } = await supabaseAdmin.from('audit_log').insert({
    tenant_id: entry.tenantId,
    actor_id: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId,
    payload: entry.payload ?? {},
  })
  if (error) {
    console.error(`[audit] écriture impossible (${entry.action} ${entry.entity}/${entry.entityId}):`, error.message)
    return false
  }
  return true
}
