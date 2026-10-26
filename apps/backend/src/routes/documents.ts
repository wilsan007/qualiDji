import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { auditFromReq } from '../lib/audit'
import { dbFail } from '../lib/http'

/**
 * §8.6 Documents contrôlés — cycle brouillon → revue → approbation →
 * publication → remplacement/dépréciation. Le contenu indexable (excerpt)
 * alimente le corpus RAG (§7.6) : seuls les documents PUBLIÉS, non
 * confidentiels, du tenant y entrent, filtrés côté serveur (R7).
 *
 * Garanties imposées aussi par la base (migration 0019) :
 *   - une seule version publiée par document (l'approbation déprécie la précédente) ;
 *   - un document publié/déprécié n'est ni supprimé ni réécrit ;
 *   - l'approbateur n'a ni créé, ni modifié, ni soumis la version (séparation des tâches).
 */
const router: ExpressRouter = Router()

const DOC_TYPES = ['procedure', 'policy', 'work_instruction', 'form', 'record_reference', 'other'] as const
const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'secret'] as const
const RESTRICTED = ['confidential', 'secret']

/** Champs modifiables ; aucune valeur par défaut ici : une mise à jour n'écrase que ce qui est fourni. */
const docFields = {
  title: z.string().min(3).max(300),
  doc_type: z.enum(DOC_TYPES),
  classification: z.enum(CLASSIFICATIONS),
  owner_role: z.string().min(1).max(100),
  /** Extrait indexable (RAG §7.6) — minimisé, pas de données personnelles. */
  excerpt: z.string().max(8000).nullable(),
}

const createInput = z.object({
  doc_key: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/).optional(),
  title: docFields.title,
  doc_type: docFields.doc_type.default('procedure'),
  classification: docFields.classification.default('internal'),
  owner_role: docFields.owner_role.default('quality_manager'),
  excerpt: docFields.excerpt.default(null),
})

const updateInput = z.object({
  title: docFields.title.optional(),
  doc_type: docFields.doc_type.optional(),
  classification: docFields.classification.optional(),
  owner_role: docFields.owner_role.optional(),
  excerpt: docFields.excerpt.optional(),
})

const reasonInput = z.object({ change_reason: z.string().min(5).max(1000) })
const rejectInput = z.object({ comment: z.string().min(3).max(1000) })

function sha256(text: string | null): string | null {
  return text ? createHash('sha256').update(text).digest('hex') : null
}

function isPlatformAdmin(req: AuthedRequest): boolean {
  const role = req.user?.role ?? ''
  return role === 'super_admin' || role === 'technical_admin'
}

function canSeeDrafts(req: AuthedRequest): boolean {
  return isPlatformAdmin(req) || (req.permissions?.has('document.approve') ?? false)
}

/** Contenu confidentiel/secret : approbateurs, rôle propriétaire du document, auteur. */
function canReadRestricted(req: AuthedRequest, doc: any): boolean {
  return canSeeDrafts(req) || doc.owner_role === req.user?.role || doc.created_by === req.user?.id
}

/** Applique la classification : `null` = document invisible, sinon copie éventuellement expurgée. */
function applyClassification(req: AuthedRequest, doc: any): any | null {
  if (!RESTRICTED.includes(doc.classification) || canReadRestricted(req, doc)) return doc
  if (doc.classification === 'secret') return null
  return { ...doc, excerpt: null, restricted: true }
}

const uniq = (ids: (string | null | undefined)[]) => Array.from(new Set(ids.filter(Boolean) as string[]))

/** Charge un document avec la règle de visibilité des brouillons et la classification. */
async function loadDocument(id: string, req: AuthedRequest, res: any) {
  const { data: doc, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id!)
    .eq('id', id)
    .maybeSingle()
  if (error || !doc) {
    res.status(404).json({ error: 'document not found' })
    return null
  }
  if (doc.status !== 'published' && !canSeeDrafts(req)) {
    res.status(403).json({ error: 'missing permission: document.approve', code: 'ERR_PERMISSION_DENIED' })
    return null
  }
  if (doc.classification === 'secret' && !canReadRestricted(req, doc)) {
    res.status(404).json({ error: 'document not found' })
    return null
  }
  return doc
}

/** Transition conditionnelle (pas de double traitement) : null si l'état source n'est plus le bon. */
async function transition(id: string, from: string, patch: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .update(patch)
    .eq('id', id)
    .eq('status', from)
    .select()
    .maybeSingle()
  return { row: data, error }
}

// ── Liste du registre (published par défaut) ────────────────────────────────
router.get('/', requireAuth, requireTenant, requirePermission('document.read'), async (req: AuthedRequest, res) => {
  const includeAll = req.query.include_all === '1'
  if (includeAll && !canSeeDrafts(req)) {
    return res.status(403).json({ error: 'missing permission: document.approve', code: 'ERR_PERMISSION_DENIED' })
  }
  let query = supabaseAdmin
    .from('documents')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id!)
    .order('title')
  if (!includeAll) query = query.eq('status', 'published')
  const { data, error } = await query
  if (error) return dbFail(res, error, 'documents.list', 500)
  const documents = (data ?? []).map((d) => applyClassification(req, d)).filter(Boolean)
  res.json({ documents })
})

// ── Détail ──────────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, requireTenant, requirePermission('document.read'), async (req: AuthedRequest, res) => {
  const doc = await loadDocument(req.params.id, req, res)
  if (!doc) return
  // Historique des versions (même doc_key, tenant courant)
  const { data: versions } = await supabaseAdmin
    .from('documents')
    .select('id, doc_key, version, status, change_reason, created_at, approved_at')
    .eq('tenant_id', req.user!.tenant_id!)
    .eq('doc_key', doc.doc_key)
    .order('version', { ascending: false })
  res.json({ document: applyClassification(req, doc), versions: versions ?? [] })
})

// ── Création d'un brouillon ─────────────────────────────────────────────────
router.post('/', requireAuth, requireTenant, requirePermission('document.create'), async (req: AuthedRequest, res) => {
  const parsed = createInput.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid document payload', details: parsed.error.flatten() })
  }
  const input = parsed.data
  const docKey = input.doc_key ?? `DOC_${randomBytes(3).toString('hex').toUpperCase()}`

  const { data: existing } = await supabaseAdmin
    .from('documents')
    .select('id')
    .eq('tenant_id', req.user!.tenant_id!)
    .eq('doc_key', docKey)
    .limit(1)
  if (existing?.length) return res.status(409).json({ error: `doc_key déjà utilisé: ${docKey}` })

  const { data: doc, error } = await supabaseAdmin
    .from('documents')
    .insert({
      tenant_id: req.user!.tenant_id!,
      doc_key: docKey,
      title: input.title,
      doc_type: input.doc_type,
      classification: input.classification,
      owner_role: input.owner_role,
      version: 1,
      status: 'draft',
      excerpt: input.excerpt,
      content_sha256: sha256(input.excerpt),
      created_by: req.user!.id,
      contributor_ids: [req.user!.id],
    })
    .select()
    .single()
  if (error) return dbFail(res, error, 'documents.create')
  await auditFromReq(req, 'document.create', 'document', doc.id, { doc_key: docKey, title: input.title, classification: input.classification })
  res.status(201).json({ document: doc })
})

// ── Édition d'un brouillon (champs fournis seulement) ───────────────────────
router.put('/:id', requireAuth, requireTenant, requirePermission('document.edit_draft'), async (req: AuthedRequest, res) => {
  const parsed = updateInput.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid document payload', details: parsed.error.flatten() })
  }
  const input = parsed.data
  const doc = await loadDocument(req.params.id, req, res)
  if (!doc) return
  if (doc.status !== 'draft') {
    return res.status(409).json({ error: "document non éditable — dupliquez pour créer une nouvelle version (§8.6)" })
  }
  const patch: Record<string, unknown> = {
    ...input,
    updated_by: req.user!.id,
    updated_at: new Date().toISOString(),
    contributor_ids: uniq([...(doc.contributor_ids ?? []), req.user!.id]),
  }
  if (input.excerpt !== undefined) patch.content_sha256 = sha256(input.excerpt)
  const { row, error } = await transition(doc.id, 'draft', patch)
  if (error) return dbFail(res, error, 'documents.update')
  if (!row) return res.status(409).json({ error: 'le document a changé d\'état pendant la modification' })
  await auditFromReq(req, 'document.update_draft', 'document', doc.id, { doc_key: doc.doc_key, fields: Object.keys(input) })
  res.json({ document: row })
})

// ── Soumission en revue ─────────────────────────────────────────────────────
router.post('/:id/submit', requireAuth, requireTenant, requirePermission('document.edit_draft'), async (req: AuthedRequest, res) => {
  const doc = await loadDocument(req.params.id, req, res)
  if (!doc) return
  if (doc.status !== 'draft') return res.status(409).json({ error: `cannot submit: status is ${doc.status}` })
  const { row, error } = await transition(doc.id, 'draft', {
    status: 'in_review',
    submitted_by: req.user!.id,
    contributor_ids: uniq([...(doc.contributor_ids ?? []), req.user!.id]),
    updated_by: req.user!.id,
    updated_at: new Date().toISOString(),
  })
  if (error) return dbFail(res, error, 'documents.submit')
  if (!row) return res.status(409).json({ error: 'cannot submit: le document a changé d\'état' })
  await auditFromReq(req, 'document.submit', 'document', doc.id, { doc_key: doc.doc_key })
  res.json({ document: row })
})

// ── Approbation → publication (date d'effet serveur) ────────────────────────
// Atomique en base : publie cette version, déprécie la précédente, refuse l'auteur/le soumetteur.
router.post('/:id/approve', requireAuth, requireTenant, requirePermission('document.approve'), async (req: AuthedRequest, res) => {
  const doc = await loadDocument(req.params.id, req, res)
  if (!doc) return
  if (doc.status !== 'in_review') return res.status(409).json({ error: `cannot approve: status is ${doc.status}` })

  const { data, error } = await supabaseAdmin.rpc('document_approve', {
    p_id: doc.id,
    p_tenant: req.user!.tenant_id!,
    p_actor: req.user!.id,
  })
  if (error) {
    if (error.message.includes('ERR_SEGREGATION_OF_DUTIES')) {
      return res.status(403).json({
        error: "séparation des tâches : l'approbateur ne peut pas être l'auteur, un contributeur ou le soumetteur de la version",
        code: 'ERR_SEGREGATION_OF_DUTIES',
      })
    }
    if (error.message.includes('ERR_BAD_STATE')) return res.status(409).json({ error: 'cannot approve: état modifié' })
    return dbFail(res, error, 'documents.approve')
  }
  if (!data) return res.status(404).json({ error: 'document not found' })
  const { data: replaced } = await supabaseAdmin
    .from('documents')
    .select('id, version')
    .eq('tenant_id', req.user!.tenant_id!)
    .eq('doc_key', doc.doc_key)
    .eq('status', 'deprecated')
    .eq('updated_at', (data as any).approved_at)
    .neq('id', doc.id)
  await auditFromReq(req, 'document.approve', 'document', doc.id, {
    doc_key: doc.doc_key,
    version: doc.version,
    replaced_versions: (replaced ?? []).map((r) => r.version),
  })
  res.json({ document: data })
})

// ── Rejet → brouillon (motif obligatoire) ───────────────────────────────────
router.post('/:id/reject', requireAuth, requireTenant, requirePermission('document.approve'), async (req: AuthedRequest, res) => {
  const parsed = rejectInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'comment (motif de rejet) obligatoire' })
  const doc = await loadDocument(req.params.id, req, res)
  if (!doc) return
  if (doc.status !== 'in_review') return res.status(409).json({ error: `cannot reject: status is ${doc.status}` })
  const { row, error } = await transition(doc.id, 'in_review', {
    status: 'draft',
    review_comment: parsed.data.comment,
    updated_by: req.user!.id,
    updated_at: new Date().toISOString(),
  })
  if (error) return dbFail(res, error, 'documents.reject')
  if (!row) return res.status(409).json({ error: 'cannot reject: le document a changé d\'état' })
  await auditFromReq(req, 'document.reject', 'document', doc.id, { comment: parsed.data.comment })
  res.json({ document: row })
})

// ── Remplacement versionné (§8.6) : nouvelle version liée à la précédente ───
router.post('/:id/duplicate', requireAuth, requireTenant, requirePermission('document.create'), async (req: AuthedRequest, res) => {
  const parsed = reasonInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'change_reason (motif) obligatoire' })
  const doc = await loadDocument(req.params.id, req, res)
  if (!doc) return

  const { data: last } = await supabaseAdmin
    .from('documents')
    .select('version')
    .eq('tenant_id', doc.tenant_id)
    .eq('doc_key', doc.doc_key)
    .order('version', { ascending: false })
    .limit(1)
  const nextVersion = (last?.[0]?.version ?? doc.version) + 1

  const { data: created, error } = await supabaseAdmin
    .from('documents')
    .insert({
      tenant_id: doc.tenant_id,
      doc_key: doc.doc_key,
      title: doc.title,
      doc_type: doc.doc_type,
      classification: doc.classification,
      owner_role: doc.owner_role,
      version: nextVersion,
      status: 'draft',
      excerpt: doc.excerpt,
      content_sha256: doc.content_sha256,
      change_reason: parsed.data.change_reason,
      supersedes_id: doc.id,
      created_by: req.user!.id,
      contributor_ids: [req.user!.id],
    })
    .select()
    .single()
  if (error) return dbFail(res, error, 'documents.duplicate')
  await auditFromReq(req, 'document.duplicate', 'document', created.id, { doc_key: doc.doc_key, version: nextVersion, from: doc.id })
  res.status(201).json({ document: created })
})

// ── Dépréciation : retrait du registre sans suppression (§8.5) ──────────────
router.post('/:id/deprecate', requireAuth, requireTenant, requirePermission('document.approve'), async (req: AuthedRequest, res) => {
  const parsed = reasonInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'change_reason (motif) obligatoire' })
  const doc = await loadDocument(req.params.id, req, res)
  if (!doc) return
  if (doc.status === 'deprecated' || doc.status === 'archived') {
    return res.status(409).json({ error: 'document déjà retiré' })
  }
  const { row, error } = await transition(doc.id, doc.status, {
    status: 'deprecated',
    change_reason: parsed.data.change_reason,
    updated_by: req.user!.id,
    updated_at: new Date().toISOString(),
  })
  if (error) return dbFail(res, error, 'documents.deprecate')
  if (!row) return res.status(409).json({ error: 'le document a changé d\'état' })
  await auditFromReq(req, 'document.deprecate', 'document', doc.id, { change_reason: parsed.data.change_reason })
  res.json({ document: row })
})

// ── Suppression : brouillons et documents en revue seulement (§8.5) ─────────
// Publié, déprécié et archivé ne sont JAMAIS supprimés (trigger documents_guard côté base).
router.delete('/:id', requireAuth, requireTenant, requirePermission('document.approve'), async (req: AuthedRequest, res) => {
  const doc = await loadDocument(req.params.id, req, res)
  if (!doc) return
  if (!['draft', 'in_review'].includes(doc.status)) {
    return res.status(409).json({
      error: `un document ${doc.status} n'est jamais supprimé — il reste au registre pour la traçabilité (§8.5)`,
      code: 'ERR_DOCUMENT_RETAINED',
    })
  }
  const { count } = await supabaseAdmin
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('supersedes_id', doc.id)
  if (count) return res.status(409).json({ error: 'une version suivante référence ce document' })
  const { error } = await supabaseAdmin.from('documents').delete().eq('id', doc.id).in('status', ['draft', 'in_review'])
  if (error) return dbFail(res, error, 'documents.delete')
  await auditFromReq(req, 'document.delete', 'document', doc.id, { doc_key: doc.doc_key, status: doc.status, version: doc.version })
  res.status(204).end()
})

export const documentsRouter: ExpressRouter = router
