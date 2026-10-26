import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { auditFromReq } from '../lib/audit'
import { dbFail, parsePagination } from '../lib/http'

const router: ExpressRouter = Router()

// Journal d'audit — consultation sensible réservée aux rôles porteurs d'audit.export (§3.3).
// La consultation elle-même est journalisée (lecture sensible) ; pagination validée.
router.get('/', requireAuth, requireTenant, requirePermission('audit.export'), async (req: AuthedRequest, res) => {
  const page = parsePagination(req.query)
  if (!page.ok) return res.status(400).json({ error: 'pagination invalide', code: 'ERR_INVALID_INPUT', details: page.details })
  const { data, error } = await supabaseAdmin
    .from('audit_log')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false })
    .range(page.offset, page.offset + page.limit - 1)
  if (error) return dbFail(res, error, 'audit-log.list')
  await auditFromReq(req, 'audit_log.view', 'audit_log', req.user!.tenant_id!, { limit: page.limit, offset: page.offset })
  res.json({ events: data ?? [], limit: page.limit, offset: page.offset })
})

// Trace d'une preuve (chaîne de preuves) : la preuve elle-même (empreinte, auteur, horodatage — immuables)
// et TOUS les évènements du journal qui la concernent, bornés au tenant courant.
router.get('/trace/:evidenceId', requireAuth, requireTenant, requirePermission('evidence.read'), async (req: AuthedRequest, res) => {
  const { evidenceId } = req.params
  const tenantId = req.user!.tenant_id!
  const { data: ev } = await supabaseAdmin
    .from('evidence')
    .select('*')
    .eq('id', evidenceId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!ev) return res.status(404).json({ error: 'evidence not found' })

  const { data: logs, error } = await supabaseAdmin
    .from('audit_log')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('entity_id', evidenceId)
    .order('created_at', { ascending: true })
  if (error) return dbFail(res, error, 'audit-log.trace', 500)

  res.json({
    evidence: ev,
    // Une preuve n'a pas de « validation » propre : son intégrité se prouve par l'empreinte SHA-256
    // enregistrée au dépôt (GET /evidence/:id/verify la recalcule depuis le stockage).
    integrity: { checksum: ev.checksum, captured_by: ev.captured_by, captured_at: ev.captured_at, immutable: true },
    audit_events: logs ?? [],
  })
})

export const auditRouter: ExpressRouter = router
