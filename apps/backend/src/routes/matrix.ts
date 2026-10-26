import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
import { dbFail, parseBody } from '../lib/http'

// ============================================================================
// Matrice de traçabilité ISO 9001:2026 — Cahier des charges V4, annexes K & L
// - Registre d'exigences (K.1/K.2), tests MT-<réf>-POS/NEG (K.3),
//   registre des non-applicabilités (K.4), validations expert (K.5),
//   couverture calculée côté serveur par clause et par espace (L.4).
// Le serveur est l'autorité: aucune décision de couverture n'est prise côté UI.
// ============================================================================

// Rôles/permissions : l'autorisation est vérifiée via requirePermission (RBAC V5 §3.3) —
// workflow.edit_draft pour les champs K.2/K.4, evidence.upload pour l'enregistrement des tests K.3.

const CLAUSES = ['4', '5', '6', '7', '8', '9', '10'] as const
const SPACES = ['C', 'P', 'AE'] as const

export type TestStatus = 'todo' | 'passed' | 'failed'
export type GapStatus =
  | 'not_analyzed'
  | 'not_covered'
  | 'partially_covered'
  | 'ready_to_test'
  | 'tested'
  | 'accepted_with_reserve'
  | 'not_applicable_justified'

export interface RequirementRow {
  id: string
  clause: string
  title: string
  requirement_type: string
  source_ref: string
  process_owner: string | null
  software_control: string | null
  objective_evidence: string | null
  verification_method: string | null
  spaces: string[]
}

export interface AssessmentRow {
  requirement_id: string
  applicability: 'applicable' | 'not_applicable' | 'to_review'
  na_justification: string | null
  na_approved_by: string | null
  na_approved_at: string | null
  last_reason: string | null
  updated_at: string
  /** Surcharges K.2 propres au tenant (le catalogue global n'est jamais modifié par un tenant). */
  process_owner: string | null
  software_control: string | null
  objective_evidence: string | null
  verification_method: string | null
}

export interface TestRow {
  requirement_id: string
  kind: 'positive' | 'negative'
  code: string
  scenario: string | null
  status: TestStatus
  notes: string | null
  executed_at: string | null
}

export interface ValidationRow {
  id: string
  matrix_version: number
  perimeter: string
  expert_name: string
  expert_role: string
  decision: 'validated' | 'validated_with_reserves' | 'refused'
  reserves: string | null
  decided_at: string
}

export interface MatrixLine extends RequirementRow {
  workflow_codes: string[]
  assessment: AssessmentRow | null
  tests: { positive: TestRow | null; negative: TestRow | null }
  gap_status: GapStatus
  blocking: boolean
  blocking_reasons: string[]
}

/** Charge le catalogue + les données tenant et calcule l'état de chaque ligne. */
export async function loadMatrix(tenantId: string): Promise<{
  lines: MatrixLine[]
  validations: ValidationRow[]
}> {
  const [reqRes, mapRes, assessRes, testRes, validRes] = await Promise.all([
    supabaseAdmin.from('requirements').select('*'),
    supabaseAdmin.from('workflow_requirement_map').select('workflow_code, requirement_id'),
    supabaseAdmin.from('requirement_assessments').select('*').eq('tenant_id', tenantId),
    supabaseAdmin.from('requirement_tests').select('*').eq('tenant_id', tenantId),
    supabaseAdmin
      .from('matrix_validations')
      .select('id, matrix_version, perimeter, expert_name, expert_role, decision, reserves, decided_at')
      .eq('tenant_id', tenantId)
      .order('decided_at', { ascending: false }),
  ])
  if (reqRes.error) throw new Error(reqRes.error.message)
  if (assessRes.error) throw new Error(assessRes.error.message)
  if (testRes.error) throw new Error(testRes.error.message)

  const requirements: RequirementRow[] = (reqRes.data ?? []) as RequirementRow[]
  const maps: { workflow_code: string; requirement_id: string }[] = mapRes.data ?? []
  const assessments: AssessmentRow[] = (assessRes.data ?? []) as AssessmentRow[]
  const tests: TestRow[] = (testRes.data ?? []) as TestRow[]
  const validations: ValidationRow[] = (validRes.data ?? []) as ValidationRow[]

  const workflowsByReq = new Map<string, string[]>()
  for (const m of maps) {
    const list = workflowsByReq.get(m.requirement_id) ?? []
    list.push(m.workflow_code)
    workflowsByReq.set(m.requirement_id, list)
  }
  const assessByReq = new Map(assessments.map((a) => [a.requirement_id, a]))
  const testsByReq = new Map<string, { positive: TestRow | null; negative: TestRow | null }>()
  for (const t of tests) {
    const entry = testsByReq.get(t.requirement_id) ?? { positive: null, negative: null }
    if (t.kind === 'positive') entry.positive = t
    else entry.negative = t
    testsByReq.set(t.requirement_id, entry)
  }

  // Dernière validation expert par périmètre (K.5) — statut « accepté avec réserve ».
  const reservesPerimeters = new Set<string>()
  for (const v of validations) {
    if (v.decision === 'validated_with_reserves') reservesPerimeters.add(v.perimeter)
  }

  const lines = requirements.map((r) => {
    const assessment = assessByReq.get(r.id) ?? null
    const lineTests = testsByReq.get(r.id) ?? { positive: null, negative: null }
    // Valeur effective = surcharge du tenant sinon valeur du catalogue global
    const eff: RequirementRow = {
      ...r,
      process_owner: assessment?.process_owner ?? r.process_owner,
      software_control: assessment?.software_control ?? r.software_control,
      objective_evidence: assessment?.objective_evidence ?? r.objective_evidence,
      verification_method: assessment?.verification_method ?? r.verification_method,
    }
    const state = computeState(eff, assessment, lineTests, reservesPerimeters)
    return {
      ...eff,
      workflow_codes: workflowsByReq.get(r.id) ?? [],
      assessment,
      tests: lineTests,
      gap_status: state.status,
      blocking: state.blocking,
      blocking_reasons: state.reasons,
    } satisfies MatrixLine
  })

  return { lines, validations }
}

/**
 * Calcule le statut de couverture d'une ligne (statuts normalisés L.4) et si
 * elle constitue une lacune bloquante (H-11 / L.4: exigence applicable sans
 * fonction, sans preuve ou sans couple de tests = lacune bloquante).
 */
/** Calcule l'état de couverture d'une ligne — exporté pour les tests (§16). */
export function computeState(
  req: RequirementRow,
  assessment: AssessmentRow | null,
  tests: { positive: TestRow | null; negative: TestRow | null },
  reservesPerimeters: Set<string>
): { status: GapStatus; blocking: boolean; reasons: string[] } {
  const reasons: string[] = []

  // Notes / Annexe A / règles: tracées mais hors comptes d'exigences applicables.
  if (req.requirement_type !== 'requirement') {
    return { status: 'not_analyzed', blocking: false, reasons }
  }

  if (assessment?.applicability === 'to_review') {
    return {
      status: 'not_analyzed',
      blocking: true,
      reasons: ['Applicabilité en cours de revue — ligne non analysée (étape K.2)'],
    }
  }

  if (assessment?.applicability === 'not_applicable') {
    const justified = Boolean(
      assessment.na_justification && assessment.na_approved_by && assessment.na_approved_at
    )
    if (justified) {
      return { status: 'not_applicable_justified', blocking: false, reasons }
    }
    return {
      status: 'not_covered',
      blocking: true,
      reasons: [
        assessment.na_justification
          ? 'Non-applicabilité en attente d\'approbation par une personne distincte du demandeur (étape K.4)'
          : 'Non-applicabilité sans justification motivée (étape K.4)',
      ],
    }
  }

  // Exigence applicable (confirmée ou par défaut) — étape K.2.
  if (!req.process_owner) reasons.push('Responsable non renseigné (étape K.2)')
  if (!req.objective_evidence) reasons.push('Preuve attendue non renseignée (étape K.2)')
  if (!req.verification_method) reasons.push('Méthode de vérification non renseignée (étape K.2)')
  if (reasons.length > 0) {
    return { status: 'not_covered', blocking: true, reasons }
  }

  const posPassed = tests.positive?.status === 'passed'
  const negPassed = tests.negative?.status === 'passed'
  const anyFailed = tests.positive?.status === 'failed' || tests.negative?.status === 'failed'
  const anyRun = Boolean(tests.positive || tests.negative)

  if (posPassed && negPassed) {
    if (reservesPerimeters.has(`clause_${req.clause}`)) {
      return {
        status: 'accepted_with_reserve',
        blocking: false,
        reasons: [`Validée avec réserves par le spécialiste (étape K.5, clause ${req.clause})`],
      }
    }
    return { status: 'tested', blocking: false, reasons }
  }

  if (anyFailed || anyRun) {
    return {
      status: 'partially_covered',
      blocking: true,
      reasons: ['Couple de tests MT-…-POS / MT-…-NEG incomplet ou en échec (étape K.3)'],
    }
  }

  return {
    status: 'ready_to_test',
    blocking: true,
    reasons: ['Couple de tests MT-…-POS / MT-…-NEG non exécuté (étape K.3)'],
  }
}

interface CoverageBucket {
  scope: string
  label: string
  applicable: number
  not_analyzed: number
  not_covered: number
  partially_covered: number
  ready_to_test: number
  tested: number
  accepted_with_reserve: number
  na_justified: number
  tested_pos: number
  tested_neg: number
  blocking_gaps: number
}

const CLAUSE_LABELS: Record<string, string> = {
  '4': 'Clause 4 — Contexte',
  '5': 'Clause 5 — Leadership',
  '6': 'Clause 6 — Planification',
  '7': 'Clause 7 — Support',
  '8': 'Clause 8 — Opérations',
  '9': 'Clause 9 — Évaluation des performances',
  '10': 'Clause 10 — Amélioration',
}

const SPACE_LABELS: Record<string, string> = {
  C: 'Espace 1 — Consultant / accompagnement',
  P: 'Espace 2 — Personnel interne / auditeur interne',
  AE: 'Espace 3 — Auditeur externe',
}

function emptyBucket(scope: string, label: string): CoverageBucket {
  return {
    scope,
    label,
    applicable: 0,
    not_analyzed: 0,
    not_covered: 0,
    partially_covered: 0,
    ready_to_test: 0,
    tested: 0,
    accepted_with_reserve: 0,
    na_justified: 0,
    tested_pos: 0,
    tested_neg: 0,
    blocking_gaps: 0,
  }
}

function bumpBucket(acc: CoverageBucket, line: MatrixLine) {
  acc.applicable += line.assessment?.applicability === 'not_applicable' ? 0 : 1
  switch (line.gap_status) {
    case 'not_analyzed':
      acc.not_analyzed += 1
      break
    case 'not_covered':
      acc.not_covered += 1
      break
    case 'partially_covered':
      acc.partially_covered += 1
      break
    case 'ready_to_test':
      acc.ready_to_test += 1
      break
    case 'tested':
      acc.tested += 1
      break
    case 'accepted_with_reserve':
      acc.accepted_with_reserve += 1
      break
    case 'not_applicable_justified':
      acc.na_justified += 1
      break
  }
  if (line.tests.positive?.status === 'passed') acc.tested_pos += 1
  if (line.tests.negative?.status === 'passed') acc.tested_neg += 1
  if (line.blocking) acc.blocking_gaps += 1
}

/** Agrège la couverture par clause, par espace et au global (tableau L.4) — exporté pour les tests (§16). */
export function buildCoverage(lines: MatrixLine[]) {
  const applicableLines = lines.filter((l) => l.requirement_type === 'requirement')

  const totals = emptyBucket('total', 'Toutes clauses')
  for (const line of applicableLines) bumpBucket(totals, line)

  const clauses = CLAUSES.map((clause) => {
    const bucket = emptyBucket(clause, CLAUSE_LABELS[clause])
    for (const line of applicableLines.filter((l) => l.clause === clause)) bumpBucket(bucket, line)
    return bucket
  })

  const spaces = SPACES.map((space) => {
    const bucket = emptyBucket(space, SPACE_LABELS[space])
    for (const line of applicableLines.filter((l) => l.spaces.includes(space))) {
      bumpBucket(bucket, line)
    }
    return bucket
  })

  return { totals, clauses, spaces }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Journalise une modification de la matrice (traçabilité L.5). */
async function auditMatrix(
  tenantId: string,
  actorId: string,
  action: string,
  entityId: string,
  payload: Record<string, unknown>
) {
  await writeAudit({ tenantId, actorId, action, entity: 'requirement', entityId, payload })
}

const router: ExpressRouter = Router()

// Registre des exigences — filtres optionnels ?clause= ?space= ?status=
router.get('/requirements', requireAuth, requireTenant, requirePermission('workflow.read'), async (req: AuthedRequest, res) => {
  try {
    const { lines } = await loadMatrix(req.user!.tenant_id!)
    let out = lines
    const clause = req.query.clause ? String(req.query.clause) : null
    const space = req.query.space ? String(req.query.space) : null
    const status = req.query.status ? String(req.query.status) : null
    if (clause) out = out.filter((l) => l.clause === clause)
    if (space) out = out.filter((l) => l.spaces.includes(space))
    if (status) out = out.filter((l) => l.gap_status === status)
    res.json({ requirements: out })
  } catch (e: any) {
    console.error(e)
    res.status(500).json({ error: 'erreur interne', code: 'ERR_INTERNAL' })
  }
})

// Tableau de bord de couverture calculé côté serveur (L.4) — par clause et espace
router.get('/coverage', requireAuth, requireTenant, requirePermission('workflow.read'), async (req: AuthedRequest, res) => {
  try {
    const { lines, validations } = await loadMatrix(req.user!.tenant_id!)
    res.json({ ...buildCoverage(lines), validations })
  } catch (e: any) {
    console.error(e)
    res.status(500).json({ error: 'erreur interne', code: 'ERR_INTERNAL' })
  }
})

const K2_FIELDS = ['process_owner', 'objective_evidence', 'software_control', 'verification_method'] as const

const patchBody = z.object({
  reason: z.string().trim().min(3, 'motif obligatoire (3 caractères min.)').max(1000),
  applicability: z.enum(['applicable', 'not_applicable', 'to_review']).optional(),
  na_justification: z.string().max(4000).optional(),
  process_owner: z.string().max(300).optional(),
  objective_evidence: z.string().max(2000).optional(),
  software_control: z.string().max(2000).optional(),
  verification_method: z.string().max(2000).optional(),
  // L'approbation d'une non-applicabilité n'est plus une saisie libre (H3) : voir POST …/na-approve.
  na_approved_by: z.undefined({ error: "na_approved_by n'est plus accepté : l'approbation passe par POST /matrix/requirements/:id/na-approve" }).optional(),
})

// Mise à jour d'une ligne: champs K.2 + demande de non-applicabilité K.4 — motif obligatoire (L.5)
router.patch(
  '/requirements/:id',
  requireAuth,
  requireTenant,
  requirePermission('workflow.edit_draft'),
  async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenant_id!
  const { id } = req.params
  const body = parseBody(patchBody, req.body, res)
  if (!body) return
  const reason = body.reason

  const { data: reqRow } = await supabaseAdmin
    .from('requirements')
    .select('*')
    .eq('id', id)
    .single()
  if (!reqRow) return res.status(404).json({ error: 'Exigence introuvable.', code: 'ERR_NOT_FOUND' })

  // Champs de couverture K.2 : SURCHARGES du tenant (requirement_assessments) — le catalogue global
  // `requirements` n'est jamais écrit depuis l'API tenant (C5).
  const catalogPatch: Record<string, string> = {}
  for (const field of K2_FIELDS) {
    const value = body[field]
    if (typeof value === 'string') catalogPatch[field] = value.trim()
  }

  // Applicabilité / non-applicabilité (étape K.4)
  const { data: existing } = await supabaseAdmin
    .from('requirement_assessments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('requirement_id', id)
    .maybeSingle()

  const applicability = body.applicability ?? existing?.applicability ?? 'applicable'
  const naJustification = (body.na_justification ?? existing?.na_justification ?? '').trim() || null

  if (applicability === 'not_applicable' && !naJustification) {
    return res.status(400).json({
      error: 'Une exigence non applicable doit porter une justification motivée — étape K.4.',
      code: 'ERR_NA_JUSTIFICATION_REQUIRED',
    })
  }

  // Toute nouvelle demande (changement d'applicabilité ou de justification) annule l'approbation
  // précédente et fait du demandeur courant le « demandeur » : il ne pourra pas l'approuver (H3).
  const naChanged =
    applicability === 'not_applicable' &&
    (existing?.applicability !== 'not_applicable' || (existing?.na_justification ?? null) !== naJustification)

  const now = new Date().toISOString()
  const naFields =
    applicability !== 'not_applicable'
      ? { na_justification: null, na_approved_by: null, na_approved_at: null, na_requested_by: null, na_approved_user_id: null }
      : naChanged
        ? { na_justification: naJustification, na_approved_by: null, na_approved_at: null, na_requested_by: req.user!.id, na_approved_user_id: null }
        : { na_justification: naJustification }

  const { error: upsertError } = await supabaseAdmin.from('requirement_assessments').upsert(
    {
      tenant_id: tenantId,
      requirement_id: id,
      applicability,
      ...naFields,
      last_reason: reason,
      updated_by: req.user!.id,
      updated_at: now,
      ...catalogPatch,
    },
    { onConflict: 'tenant_id,requirement_id' }
  )
  if (upsertError) return dbFail(res, upsertError, 'matrix.patch')

  await auditMatrix(tenantId, req.user!.id, 'matrix.requirement.update', id, {
    applicability,
    reason,
    catalog_fields: Object.keys(catalogPatch),
    na_requested: naChanged,
  })

  const { lines } = await loadMatrix(tenantId)
  res.json({ requirement: lines.find((l) => l.id === id) ?? null })
})

// Approbation d'une non-applicabilité (K.4) — par une personne DISTINCTE du demandeur ; le nom et la
// fonction de l'approbateur sont déterminés par le serveur (jamais saisis par le demandeur).
router.post(
  '/requirements/:id/na-approve',
  requireAuth,
  requireTenant,
  requirePermission('workflow.approve'),
  async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenant_id!
  const { id } = req.params
  const { data: assessment } = await supabaseAdmin
    .from('requirement_assessments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('requirement_id', id)
    .maybeSingle()
  if (!assessment) return res.status(404).json({ error: 'Exigence introuvable.', code: 'ERR_NOT_FOUND' })
  if (assessment.applicability !== 'not_applicable' || !assessment.na_justification) {
    return res.status(409).json({ error: "Aucune demande de non-applicabilité justifiée à approuver.", code: 'ERR_NA_NOT_REQUESTED' })
  }
  if (assessment.na_approved_at) {
    return res.status(409).json({ error: 'Non-applicabilité déjà approuvée.', code: 'ERR_NA_ALREADY_APPROVED' })
  }
  if (assessment.na_requested_by === req.user!.id || assessment.updated_by === req.user!.id) {
    return res.status(403).json({
      error: "Séparation des tâches : l'approbateur doit être distinct du demandeur (K.4).",
      code: 'ERR_SEGREGATION_OF_DUTIES',
    })
  }
  const { data: profile } = await supabaseAdmin
    .from('user_profiles').select('display_name, role').eq('id', req.user!.id).maybeSingle()
  const approver = `${profile?.display_name || req.user!.email || req.user!.id} (${profile?.role ?? req.user!.role ?? 'rôle inconnu'})`

  const now = new Date().toISOString()
  const { data: updated, error } = await supabaseAdmin
    .from('requirement_assessments')
    .update({ na_approved_by: approver, na_approved_at: now, na_approved_user_id: req.user!.id, updated_at: now })
    .eq('id', assessment.id)
    .is('na_approved_at', null)
    .select('id')
  if (error) return dbFail(res, error, 'matrix.na-approve')
  if (!updated?.length) return res.status(409).json({ error: 'Non-applicabilité déjà approuvée.', code: 'ERR_NA_ALREADY_APPROVED' })

  await auditMatrix(tenantId, req.user!.id, 'matrix.requirement.na_approve', id, { requested_by: assessment.na_requested_by })
  const { lines } = await loadMatrix(tenantId)
  res.json({ requirement: lines.find((l) => l.id === id) ?? null })
})

const testBody = z.object({
  kind: z.enum(['positive', 'negative']).default('positive'),
  status: z.enum(['todo', 'passed', 'failed']),
  notes: z.string().max(4000).optional(),
  scenario: z.string().max(2000).optional(),
})

// Enregistre un test MT-<réf>-POS / MT-<réf>-NEG (étape K.3)
router.post(
  '/requirements/:id/tests',
  requireAuth,
  requireTenant,
  // H3 : l'enregistrement d'un test K.3 « passed » engage la couverture — réservé aux porteurs de
  // workflow.edit_draft (qualité, responsables), plus à tout détenteur de evidence.upload (opérateurs).
  requirePermission('workflow.edit_draft'),
  async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenant_id!
  const { id } = req.params
  const body = parseBody(testBody, req.body, res)
  if (!body) return

  const kind = body.kind
  const status = body.status

  const { data: reqRow } = await supabaseAdmin
    .from('requirements')
    .select('id, source_ref, verification_method')
    .eq('id', id)
    .single()
  if (!reqRow) return res.status(404).json({ error: 'Exigence introuvable.', code: 'ERR_NOT_FOUND' })
  const { data: override } = await supabaseAdmin
    .from('requirement_assessments').select('verification_method').eq('tenant_id', tenantId).eq('requirement_id', id).maybeSingle()
  const effectiveMethod = override?.verification_method ?? reqRow.verification_method

  const now = new Date().toISOString()
  const executed = status === 'todo' ? null : now
  const { data: test, error } = await supabaseAdmin
    .from('requirement_tests')
    .upsert(
      {
        tenant_id: tenantId,
        requirement_id: id,
        kind,
        code: `MT-${reqRow.source_ref}-${kind === 'positive' ? 'POS' : 'NEG'}`,
        scenario: body.scenario ?? effectiveMethod,
        status,
        notes: body.notes?.trim() || null,
        executed_by: executed ? req.user!.id : null,
        executed_at: executed,
        updated_at: now,
      },
      { onConflict: 'tenant_id,requirement_id,kind' }
    )
    .select()
    .single()
  if (error) return dbFail(res, error, 'matrix.test')

  await auditMatrix(tenantId, req.user!.id, 'matrix.test.update', id, { kind, status })

  const { lines } = await loadMatrix(tenantId)
  res.status(201).json({ test, requirement: lines.find((l) => l.id === id) ?? null })
})

// Registre des exigences non applicables (N.10 — lecture seule pour l'auditeur)
router.get('/na-register', requireAuth, requireTenant, requirePermission('workflow.read'), async (req: AuthedRequest, res) => {
  try {
    const { lines } = await loadMatrix(req.user!.tenant_id!)
    const register = lines
      .filter((l) => l.assessment?.applicability === 'not_applicable')
      .map((l) => ({
        requirement_id: l.id,
        clause: l.clause,
        title: l.title,
        justification: l.assessment?.na_justification ?? null,
        approved_by: l.assessment?.na_approved_by ?? null,
        approved_at: l.assessment?.na_approved_at ?? null,
        valid: Boolean(
          l.assessment?.na_justification &&
            l.assessment?.na_approved_by &&
            l.assessment?.na_approved_at
        ),
      }))
    res.json({ register })
  } catch (e: any) {
    console.error(e)
    res.status(500).json({ error: 'erreur interne', code: 'ERR_INTERNAL' })
  }
})

// Export structuré de la matrice (L.1: format éditable / lisible)
const CSV_HEADER = [
  'requirement_id',
  'clause',
  'exigence',
  'workflow',
  'responsable',
  'preuve_attendue',
  'controle',
  'methode_verification',
  'applicabilite',
  'justification_na',
  'approuve_par',
  'statut_couverture',
  'lacune_bloquante',
  'test_positif',
  'test_negatif',
  'espaces',
]

router.get('/export', requireAuth, requireTenant, requirePermission('evidence.export'), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenant_id!
    const { lines } = await loadMatrix(tenantId)
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = lines.map((l) =>
      [
        l.id,
        l.clause,
        l.title,
        l.workflow_codes.join(' | '),
        l.process_owner,
        l.objective_evidence,
        l.software_control,
        l.verification_method,
        l.assessment?.applicability ?? 'applicable',
        l.assessment?.na_justification,
        l.assessment?.na_approved_by,
        l.gap_status,
        l.blocking ? 'OUI' : 'non',
        l.tests.positive?.status ?? 'todo',
        l.tests.negative?.status ?? 'todo',
        l.spaces.join(' '),
      ]
        .map(esc)
        .join(',')
    )
    const csv = '\uFEFF' + [CSV_HEADER.map(esc).join(','), ...rows].join('\r\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="matrice_tracabilite_${new Date().toISOString().slice(0, 10)}.csv"`
    )
    res.send(csv)
  } catch (e: any) {
    console.error(e)
    res.status(500).json({ error: 'erreur interne', code: 'ERR_INTERNAL' })
  }
})

// Validations du spécialiste compétent (K.5 / L.3)
router.get('/validations', requireAuth, requireTenant, requirePermission('workflow.read'), async (req: AuthedRequest, res) => {
  try {
    const { validations } = await loadMatrix(req.user!.tenant_id!)
    res.json({ validations })
  } catch (e: any) {
    console.error(e)
    res.status(500).json({ error: 'erreur interne', code: 'ERR_INTERNAL' })
  }
})

router.post(
  '/validations',
  requireAuth,
  requireTenant,
  requirePermission('workflow.approve'),
  async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenant_id!
  const body = (req.body ?? {}) as {
    matrix_version?: number
    perimeter?: string
    expert_name?: string
    expert_role?: string
    competency_justification?: string
    decision?: string
    reserves?: string
  }
  if (body.matrix_version !== undefined && !(Number.isInteger(Number(body.matrix_version)) && Number(body.matrix_version) >= 1)) {
    return res.status(400).json({ error: 'Version de matrice invalide.', code: 'ERR_INVALID_INPUT' })
  }

  const decision = body.decision ?? ''
  if (!['validated', 'validated_with_reserves', 'refused'].includes(decision)) {
    return res.status(400).json({ error: 'Décision invalide.', code: 'ERR_INVALID_INPUT' })
  }
  const perimeter = (body.perimeter ?? '').trim()
  if (!/^[a-z0-9_]{3,40}$/.test(perimeter)) {
    return res.status(400).json({ error: 'Périmètre invalide.', code: 'ERR_INVALID_INPUT' })
  }
  if (
    !body.expert_name?.trim() ||
    !body.expert_role?.trim() ||
    !body.competency_justification?.trim()
  ) {
    return res.status(400).json({
      error:
        'Identité, fonction et justification de compétence du spécialiste obligatoires — étape K.5.',
      code: 'ERR_VALIDATION_INCOMPLETE',
    })
  }
  const reserves = body.reserves?.trim() || null
  if (decision === 'validated_with_reserves' && !reserves) {
    return res.status(400).json({
      error: 'Une validation avec réserves doit lister les corrections obligatoires — K.5.',
      code: 'ERR_RESERVES_REQUIRED',
    })
  }

  const { data: validation, error } = await supabaseAdmin
    .from('matrix_validations')
    .upsert(
      {
        tenant_id: tenantId,
        matrix_version: Number(body.matrix_version ?? 1),
        perimeter,
        expert_name: body.expert_name!.trim(),
        expert_role: body.expert_role!.trim(),
        competency_justification: body.competency_justification!.trim(),
        decision,
        reserves,
        decided_by: req.user!.id,
        decided_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,matrix_version,perimeter' }
    )
    .select()
    .single()
  if (error) return dbFail(res, error, 'matrix.validation')

  await auditMatrix(tenantId, req.user!.id, 'matrix.validation.record', perimeter, {
    decision,
    matrix_version: Number(body.matrix_version ?? 1),
  })

  res.status(201).json({ validation })
})

export const matrixRouter: ExpressRouter = router




