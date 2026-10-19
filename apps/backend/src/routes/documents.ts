import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'

/**
 * §8.6 Documents contrôlés — cycle brouillon → revue → approbation →
 * publication → remplacement/dépréciation. Le contenu indexable (excerpt)
 * alimente le corpus RAG (§7.6) : seuls les documents PUBLIÉS du tenant
 * y entrent, filtrés côté serveur (R7).
 */
const router: ExpressRouter = Router()

const DOC_TYPES = ['procedure', 'policy', 'work_instruction', 'form', 'record_reference', 'other'] as const
const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'secret'] as const

const docInput = z.object({
  doc_key: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/).optional(),
  title: z.string().min(3).max(300),
  doc_type: z.enum(DOC_TYPES).default('procedure'),
  classification: z.enum(CLASSIFICATIONS).default('internal'),
  owner_role: z.string().min(1).max(100).default('quality_manager'),
  /** Extrait indexable (RAG §7.6) — minimisé, pas de données personnelles. */
  excerpt: z.string().max(8000).nullable().default(null),
})

const reasonInput = z.object({ change_reason: z.string().min(5).max(1000) })
const rejectInput = z.object({ comment: z.string().min(3).max(1000) })

function sha256(text: string | null): string | null {
  return text ? createHash('sha256').update(text).digest('hex') : null
}

function canSeeDrafts(req: AuthedRequest): boolean {
  const role = req.user?.role ?? ''
  if (role === 'super_admin' || role === 'technical_admin') return true
  return req.permissions?.has('document.approve') ?? false
}

function audit(req: AuthedRequest, action: string, entityId: string, payload: Record<string, unknown> = {}) {
  const user = req.user
  if (!user?.tenant_id) return
  void supabaseAdmin.from('audit_log').insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action,
    entity: 'document',
    entity_id: entityId,
    payload,
  })
}

/** Charge un document avec la règle de visibilité des brouillons. */
async function loadDocument(id: string, req: AuthedRequest, res: any) {
  const { data: doc, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id!)
    .eq('id', id)
    .single()
  if (error || !doc) {
    res.status(404).json({ error: 'document not found' })
    return null
  }
  if (doc.status !== 'published' && !canSeeDrafts(req)) {
    res.status(403).json({ error: 'missing permission: document.approve', code: 'ERR_PERMISSION_DENIED' })
    return null
  }
  return doc
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
  if (error) return res.status(500).json({ error: error.message })
  res.json({ documents: data ?? [] })
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
  res.json({ document: doc, versions: versions ?? [] })
})

// ── Création d'un brouillon ─────────────────────────────────────────────────
router.post('/', requireAuth, requireTenant, requirePermission('document.create'), async (req: AuthedRequest, res) => {
  const parsed = docInput.safeParse(req.body)
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
    })
    .select()
    .single()
  if (error) return res.status(400).json({ error: error.message })
  audit(req, 'document.create', doc.id, { doc_key: docKey, title: input.title })
  res.status(201).json({ document: doc })
})

// ── Édition d'un brouillon ──────────────────────────────────────────────────
router.put('/:id', requireAuth, requireTenant, requirePermission('document.edit_draft'), async (req: AuthedRequest, res) => {
  const parsed = docInput.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid document payload', details: parsed.error.flatten() })
  }
  const input = parsed.data
  const doc = await loadDocument(req.params.id, req, res)
  if (!doc) return
  if (doc.status !== 'draft') {
    return res.status(409).json({ error: "document non éditable — dupliquez pour créer une nouvelle version (§8.6)" })
  }
  const { error } = await supabaseAdmin
    .from('documents')
    .update({
      title: input.title,
      doc_type: input.doc_type,
      classification: input.classification,
      owner_role: input.owner_role,
      excerpt: input.excerpt,
      content_sha256: sha256(input.excerpt),
      updated_by: req.user!.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', doc.id)
  if (error) return res.status(400).json({ error: error.message })
  audit(req, 'document.update_draft', doc.id, { doc_key: doc.doc_key })
  const { data: updated } = await supabaseAdmin.from('documents').select('*').eq('id', doc.id).single()
  res.json({ document: updated })
})

// ── Soumission en revue ─────────────────────────────────────────────────────
router.post('/:id/submit', requireAuth, requireTenant, requirePermission('document.edit_draft'), async (req: AuthedRequest, res) => {
  const doc = await loadDocument(req.params.id, req, res)
  if (!doc) return
  if (doc.status !== 'draft') return res.status(409).json({ error: `cannot submit: status is ${doc.status}` })
  const { error } = await supabaseAdmin
    .from('documents')
    .update({ status: 'in_review', updated_by: req.user!.id, updated_at: new Date().toISOString() })
    .eq('id', doc.id)
  if (error) return res.status(400).json({ error: error.message })
  audit(req, 'document.submit', doc.id, { doc_key: doc.doc_key })
  res.json({ document: { ...doc, status: 'in_review' } })
})

// ── Approbation → publication (date d'effet serveur) ────────────────────────
router.post('/:id/approve', requireAuth, requireTenant, requirePermission('document.approve'), async (req: AuthedRequest, res) => {
  const doc = await loadDocument(req.params.id, req, res)
  if (!doc) return
  if (doc.status !== 'in_review') return res.status(409).json({ error: `cannot approve: status is ${doc.status}` })
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from('documents')
    .update({
      status: 'published',
      effective_from: now,
      approved_by: req.user!.id,
      approved_at: now,
      updated_by: req.user!.id,
      updated_at: now,
    })
    .eq('id', doc.id)
  if (error) return res.status(400).json({ error: error.message })
  audit(req, 'document.approve', doc.id, { doc_key: doc.doc_key, version: doc.version })
  res.json({ document: { ...doc, status: 'published', effective_from: now } })
})

// ── Rejet → brouillon (motif obligatoire) ───────────────────────────────────
router.post('/:id/reject', requireAuth, requireTenant, requirePermission('document.approve'), async (req: AuthedRequest, res) => {
  const parsed = rejectInput.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'comment (motif de rejet) obligatoire' })
  const doc = await loadDocument(req.params.id, req, res)
  if (!doc) return
  if (doc.status !== 'in_review') return res.status(409).json({ error: `cannot reject: status is ${doc.status}` })
  const { error } = await supabaseAdmin
    .from('documents')
    .update({ status: 'draft', review_comment: parsed.data.comment, updated_by: req.user!.id, updated_at: new Date().toISOString() })
    .eq('id', doc.id)
  if (error) return res.status(400).json({ error: error.message })
  audit(req, 'document.reject', doc.id, { comment: parsed.data.comment })
  res.json({ document: { ...doc, status: 'draft' } })
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
    })
    .select()
    .single()
  if (error) return res.status(400).json({ error: error.message })
  audit(req, 'document.duplicate', created.id, { doc_key: doc.doc_key, version: nextVersion, from: doc.id })
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
  const { error } = await supabaseAdmin
    .from('documents')
    .update({ status: 'deprecated', change_reason: parsed.data.change_reason, updated_by: req.user!.id, updated_at: new Date().toISOString() })
    .eq('id', doc.id)
  if (error) return res.status(400).json({ error: error.message })
  audit(req, 'document.deprecate', doc.id, { change_reason: parsed.data.change_reason })
  res.json({ document: { ...doc, status: 'deprecated' } })
})

// ── Suppression : brouillons/archivés seulement (§8.5) ──────────────────────
router.delete('/:id', requireAuth, requireTenant, requirePermission('document.approve'), async (req: AuthedRequest, res) => {
  const doc = await loadDocument(req.params.id, req, res)
  if (!doc) return
  if (!['draft', 'in_review', 'archived', 'deprecated'].includes(doc.status)) {
    return res.status(409).json({ error: "un document publié n'est jamais supprimé — utilisez deprecate (§8.5)" })
  }
  const { count } = await supabaseAdmin
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('supersedes_id', doc.id)
  if (count) return res.status(409).json({ error: 'une version suivante référence ce document' })
  const { error } = await supabaseAdmin.from('documents').delete().eq('id', doc.id)
  if (error) return res.status(400).json({ error: error.message })
  audit(req, 'document.delete', doc.id, { doc_key: doc.doc_key, status: doc.status })
  res.status(204).end()
})

export const documentsRouter: ExpressRouter = router


