import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { emailMap } from '../lib/authUsers'
import { auditFromReq } from '../lib/audit'

/**
 * Module H — Rapports et préparation d'audit (V5 §5.8).
 *   - Rapport d'actions par statut / période / responsable
 *   - Registre NC+CAPA : ancienneté, gravité, responsable, échéance, efficacité
 *   - Paquet d'audit (synthèse de préparation)
 *   - Exports CSV avec date d'extraction, filtres appliqués et identité de
 *     l'exportateur (exigence §5.8) ; lecture = action.read, export = audit.export.
 * Les rapports distinguent données enregistrées (recorded) et agrégats calculés
 * (computed) — jamais de texte IA dans ces chiffres.
 */
const router: ExpressRouter = Router()

function reportFail(res: any, e: any) {
  console.error('[reports]', e?.message ?? e)
  res.status(500).json({ error: 'erreur lors de la production du rapport', code: 'ERR_INTERNAL' })
}

const DAY_MS = 86_400_000

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS)
}

function esc(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`
}

const emailsById = emailMap

const PAGE = 1000
/** Plafond de sécurité : au-delà, le rapport est marqué `truncated` (les agrégats ne sont plus exacts). */
const MAX_ROWS = 20_000
/** Rapports JSON : lignes détaillées renvoyées (les totaux/agrégats portent, eux, sur TOUTES les lignes). */
const JSON_ROWS = 500

/** Lit toutes les lignes d'une requête par pages (M4 : les totaux étaient calculés sur 500 lignes seulement). */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

interface ActionFilters {
  status?: string
  from?: string
  to?: string
  assigned_to?: string
}

/** Rapport d'actions du tenant, filtrable (§5.8). */
export async function loadActionsReport(tenantId: string, filters: ActionFilters) {
  const { rows: data, truncated } = await fetchAll<any>((from, to) => {
    let query = supabaseAdmin
      .from('actions')
      .select('*, workflow_definitions(id, name, standard_clause), workflow_actions(id, title, objective)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
    if (filters.status) query = query.eq('status', filters.status)
    if (filters.assigned_to) query = query.eq('assigned_to', filters.assigned_to)
    if (filters.from) query = query.gte('created_at', filters.from)
    if (filters.to) query = query.lte('created_at', filters.to)
    return query
  })

  const emails = await emailsById()
  const rows = data.map((a: any) => ({
    id: a.id,
    workflow: (a.workflow_definitions as any)?.name ?? a.workflow_id,
    clause: (a.workflow_definitions as any)?.standard_clause ?? null,
    title: (a.workflow_actions as any)?.title ?? a.action_def_id,
    status: a.status,
    responsible: a.assigned_to ? (emails.get(a.assigned_to) ?? a.assigned_to) : null,
    due_at: a.due_at,
    created_at: a.created_at,
    submitted_at: a.submitted_at,
    age_days: daysSince(a.created_at),
    overdue: Boolean(a.due_at) && new Date(a.due_at) < new Date() && !['approved', 'closed'].includes(a.status),
  }))

  const byStatus: Record<string, number> = {}
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1

  return {
    recorded: { total: rows.length },
    computed: { by_status: byStatus, overdue_count: rows.filter((r) => r.overdue).length },
    truncated,
    rows,
  }
}

/** Registre NC+CAPA avec ancienneté / gravité / échéance / efficacité (§5.8). */
export async function loadNcCapaReport(tenantId: string) {
  const { rows: ncList, truncated } = await fetchAll<any>((from, to) =>
    supabaseAdmin
      .from('nonconformities')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
  const { rows: capas } = await fetchAll<any>((from, to) =>
    supabaseAdmin
      .from('capas')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
  const capasByNc = new Map<string, any[]>()
  for (const c of capas) {
    const list = capasByNc.get(c.nonconformity_id) ?? []
    list.push(c)
    capasByNc.set(c.nonconformity_id, list)
  }
  const emails = await emailsById()

  const rows = ncList.map((nc) => {
    const linked = capasByNc.get(nc.id) ?? []
    const capa = linked[0] ?? null
    return {
      id: nc.id,
      title: nc.title,
      severity: nc.severity,
      status: nc.status,
      created_at: nc.created_at,
      age_days: daysSince(nc.created_at),
      declared_by: nc.created_by ? (emails.get(nc.created_by) ?? nc.created_by) : null,
      capa_root_cause: capa?.root_cause ?? null,
      capa_corrective_action: capa?.corrective_action ?? null,
      capa_responsible: capa?.responsible ?? null,
      capa_due_date: capa?.due_date ?? null,
      capa_status: capa?.status ?? null,
      capa_overdue: Boolean(capa?.due_date) && new Date(capa.due_date) < new Date() && capa?.status === 'open',
      effectiveness: capa?.effectiveness_result ?? null,
    }
  })

  const bySeverity: Record<string, number> = {}
  for (const r of rows) bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1
  const capaStatuses: Record<string, number> = {}
  for (const r of rows) if (r.capa_status) capaStatuses[r.capa_status] = (capaStatuses[r.capa_status] ?? 0) + 1

  return {
    recorded: { total_nc: rows.length, total_capa: capas.length },
    computed: {
      open_nc: rows.filter((r) => r.status === 'open').length,
      by_severity: bySeverity,
      capa_by_status: capaStatuses,
      capa_overdue_count: rows.filter((r) => r.capa_overdue).length,
      effectiveness_ineffective: rows.filter((r) => r.effectiveness === 'ineffective').length,
    },
    truncated,
    rows,
  }
}

// ── Rapport d'actions (lecture : action.read) ───────────────────────────────
router.get('/actions', requireAuth, requireTenant, requirePermission('action.read'), async (req: AuthedRequest, res) => {
  const { status, from, to, assigned_to } = req.query as Record<string, string>
  try {
    const report = await loadActionsReport(req.user!.tenant_id!, { status, from, to, assigned_to })
    res.json({
      filters: { status: status ?? null, from: from ?? null, to: to ?? null, assigned_to: assigned_to ?? null },
      ...report,
      rows: report.rows.slice(0, JSON_ROWS),
      rows_shown: Math.min(report.rows.length, JSON_ROWS),
    })
  } catch (e: any) {
    reportFail(res, e)
  }
})

// ── Registre NC+CAPA (lecture : action.read) ────────────────────────────────
router.get('/nc-capa', requireAuth, requireTenant, requirePermission('action.read'), async (req: AuthedRequest, res) => {
  try {
    const report = await loadNcCapaReport(req.user!.tenant_id!)
    res.json({ ...report, rows: report.rows.slice(0, JSON_ROWS), rows_shown: Math.min(report.rows.length, JSON_ROWS) })
  } catch (e: any) {
    reportFail(res, e)
  }
})

// ── Paquet d'audit : synthèse de préparation (audit.export) ─────────────────
router.get('/audit-pack', requireAuth, requireTenant, requirePermission('audit.export'), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenant_id!
  try {
    const actions = await loadActionsReport(tenantId, {})
    const ncCapa = await loadNcCapaReport(tenantId)

    const [{ count: wfTotal }, { count: wfPublished }, { count: reqTotal }, { count: assessTotal }] = await Promise.all([
      supabaseAdmin.from('workflow_definitions').select('id', { count: 'exact', head: true }).or(`and(tenant_id.is.null,status.eq.published),tenant_id.eq.${tenantId}`),
      supabaseAdmin.from('workflow_definitions').select('id', { count: 'exact', head: true }).eq('status', 'published').or(`tenant_id.is.null,tenant_id.eq.${tenantId}`),
      supabaseAdmin.from('requirements').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('requirement_assessments').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    ])

    const { data: events } = await supabaseAdmin
      .from('audit_log')
      .select('action, entity, actor_id, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20)

    const emails = await emailsById()
    res.json({
      meta: {
        exported_at: new Date().toISOString(),
        exported_by: req.user!.email ?? req.user!.id,
        filters: 'aucun (vue complète du tenant)',
      },
      // Données enregistrées (brutes, sans calcul)
      recorded: {
        workflows: { total: wfTotal ?? 0, published: wfPublished ?? 0 },
        requirements: { total: reqTotal ?? 0, assessed: assessTotal ?? 0 },
        actions_total: actions.recorded.total,
        nc_total: ncCapa.recorded.total_nc,
        capa_total: ncCapa.recorded.total_capa,
      },
      // Agrégats calculés côté serveur (aucun texte IA — §5.8)
      computed: {
        actions: actions.computed,
        nc_capa: ncCapa.computed,
        requirements_assessment_rate:
          reqTotal && assessTotal ? Math.round((assessTotal / reqTotal) * 1000) / 10 : null,
      },
      last_events: (events ?? []).map((e) => ({ ...e, actor: e.actor_id ? (emails.get(e.actor_id) ?? e.actor_id) : null })),
    })
  } catch (e: any) {
    reportFail(res, e)
  }
})

// ── Exports CSV (audit.export) — méta : date, filtres, exportateur (§5.8) ───
function sendCsv(res: any, filename: string, metaLines: string[], header: string[], rows: string[][]) {
  const csv = '\uFEFF' + [...metaLines.map(esc), header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(csv)
}

router.get('/actions.csv', requireAuth, requireTenant, requirePermission('audit.export'), async (req: AuthedRequest, res) => {
  const { status, from, to, assigned_to } = req.query as Record<string, string>
  try {
    const report = await loadActionsReport(req.user!.tenant_id!, { status, from, to, assigned_to })
    const filters = `status=${status ?? '*'}; from=${from ?? '*'}; to=${to ?? '*'}; responsable=${assigned_to ?? '*'}`
    await auditFromReq(req, 'report.export', 'report', 'actions.csv', { filters, rows: report.rows.length })
    sendCsv(
      res,
      `rapport_actions_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        `# Rapport d'actions — extraction ${new Date().toISOString()}`,
        `# Exporté par : ${req.user!.email ?? req.user!.id} (tenant ${req.user!.tenant_id})`,
        `# Filtres appliqués : ${filters}`,
      ],
      ['id', 'workflow', 'clause', 'titre', 'statut', 'responsable', 'echeance', 'cree_le', 'soumis_le', 'anciennete_jours', 'en_retard'],
      report.rows.map((r) => [r.id, r.workflow, r.clause, r.title, r.status, r.responsible, r.due_at, r.created_at, r.submitted_at, r.age_days, r.overdue ? 'OUI' : 'non'])
    )
  } catch (e: any) {
    reportFail(res, e)
  }
})

router.get('/nc-capa.csv', requireAuth, requireTenant, requirePermission('audit.export'), async (req: AuthedRequest, res) => {
  try {
    const report = await loadNcCapaReport(req.user!.tenant_id!)
    await auditFromReq(req, 'report.export', 'report', 'nc-capa.csv', { rows: report.rows.length })
    sendCsv(
      res,
      `registre_nc_capa_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        `# Registre NC+CAPA — extraction ${new Date().toISOString()}`,
        `# Exporté par : ${req.user!.email ?? req.user!.id} (tenant ${req.user!.tenant_id})`,
        '# Filtres appliqués : aucun (vue complète du tenant)',
      ],
      ['id', 'titre', 'gravite', 'statut', 'cree_le', 'anciennete_jours', 'declare_par', 'cause_racine', 'action_corrective', 'responsable_capa', 'echeance_capa', 'statut_capa', 'capa_en_retard', 'efficacite'],
      report.rows.map((r) => [r.id, r.title, r.severity, r.status, r.created_at, r.age_days, r.declared_by, r.capa_root_cause, r.capa_corrective_action, r.capa_responsible, r.capa_due_date, r.capa_status, r.capa_overdue ? 'OUI' : 'non', r.effectiveness])
    )
  } catch (e: any) {
    reportFail(res, e)
  }
})

export const reportsRouter: ExpressRouter = router

