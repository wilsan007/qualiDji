import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { auditFailureCount } from '../lib/audit'

/**
 * /health — sonde utilisée par les supervisors (systemd, orchestrateurs), la CI
 * et les smoke tests. Hors limitation de débit.
 *
 * H4 — pour un produit de conformité, perdre des évènements de la piste d'audit
 * n'est PAS un état sain : si des écritures du journal ont échoué (malgré la
 * nouvelle tentative et l'extraction `[audit-lost]` sur stderr), la sonde
 * répond 503 « degraded » — un redémarrage/alerte peut être déclenché et le
 * check de supervision échoue au lieu de masquer le problème.
 */
export const healthRouter: ExpressRouter = Router()

healthRouter.get('/', (_req, res) => {
  const failures = auditFailureCount()
  if (failures > 0) {
    return res.status(503).json({
      status: 'degraded',
      service: 'iso-backend',
      time: new Date().toISOString(),
      audit_write_failures: failures,
      hint: "des évènements de la piste d'audit n'ont pas pu être écrits — voir les lignes [audit-lost] dans les logs du serveur",
    })
  }
  res.json({ status: 'ok', service: 'iso-backend', time: new Date().toISOString(), audit_write_failures: 0 })
})
