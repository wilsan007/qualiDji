import { supabaseAdmin } from './supabase'

export interface AuditEntry {
  tenantId: string
  actorId: string
  action: string
  entity: string
  entityId: string
  payload?: Record<string, unknown>
}

/** Compteur d'échecs d'écriture du journal, exposé par /health (supervision). */
let failedWrites = 0
export function auditFailureCount(): number {
  return failedWrites
}

/**
 * Écrit une ligne du journal d'audit et ATTEND le résultat : supabase-js ne lève
 * pas d'exception sur une erreur SQL, un `void insert(...)` perd donc
 * silencieusement l'évènement. Ici : une nouvelle tentative, puis — en dernier
 * recours — l'évènement COMPLET est écrit sur stderr (ligne JSON `[audit-lost]`)
 * pour qu'il puisse être rejoué ; l'échec est compté (/health) et renvoyé à l'appelant.
 */
export async function writeAudit(entry: AuditEntry): Promise<boolean> {
  const row = {
    tenant_id: entry.tenantId,
    actor_id: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId,
    payload: entry.payload ?? {},
  }
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await supabaseAdmin.from('audit_log').insert(row)
      if (!error) return true
      lastError = error.message
    } catch (e: any) {
      lastError = String(e?.message ?? e)
    }
  }
  failedWrites++
  console.error(`[audit] écriture impossible (${entry.action} ${entry.entity}/${entry.entityId}): ${lastError}`)
  console.error(`[audit-lost] ${JSON.stringify({ ...row, at: new Date().toISOString() })}`)
  return false
}

/** Raccourci pour les routes : acteur et tenant pris sur la requête authentifiée. */
export async function auditFromReq(
  req: { user?: { id: string; tenant_id?: string } },
  action: string,
  entity: string,
  entityId: string,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  const user = req.user
  if (!user?.tenant_id) return false
  return writeAudit({ tenantId: user.tenant_id, actorId: user.id, action, entity, entityId, payload })
}
