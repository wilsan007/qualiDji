import { Router, raw } from 'express'
import type { Router as ExpressRouter, Response } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
import { canSeeAction, canSeeAllActions } from '../lib/access'
import {
  DEFAULT_MAX_BYTES, buildStoragePath, checkFile, isSha256Hex, sanitizeFilename, sha256Hex,
} from '../lib/evidenceFile'

/**
 * Preuves (spec §6, §7.1) — le fichier est réellement stocké :
 *   - bucket PRIVÉ `evidence` (migration 0017), jamais d'accès direct du navigateur ;
 *   - dépôt via le backend : le serveur calcule le SHA-256, le compare à celui
 *     annoncé par le client, choisit lui-même le chemin et contrôle type/signature/taille ;
 *   - lecture par URL signée de courte durée ;
 *   - vérification d'intégrité à la demande (recalcul du SHA-256 depuis le stockage).
 */
const router: ExpressRouter = Router()

const BUCKET = 'evidence'
const MAX_BYTES = Number(process.env.EVIDENCE_MAX_BYTES ?? DEFAULT_MAX_BYTES)
/** Durée de validité d'une URL signée (spec : 1 h maximum). */
const SIGNED_URL_TTL_S = Math.min(Number(process.env.EVIDENCE_URL_TTL_S ?? 300), 3600)
const TERMINAL = ['approved', 'closed']

/** Preuve du tenant courant, visible de l'utilisateur (même règle que les actions), sinon 404. */
async function loadVisibleEvidence(req: AuthedRequest, res: Response) {
  const { data: ev } = await supabaseAdmin
    .from('evidence')
    .select('*, step_submissions(step_id)')
    .eq('id', req.params.id)
    .eq('tenant_id', req.user!.tenant_id!)
    .maybeSingle()
  if (!ev) {
    res.status(404).json({ error: 'evidence not found' })
    return null
  }
  let visible = canSeeAllActions(req)
  if (!visible && ev.action_id) {
    const { data: a } = await supabaseAdmin.from('actions').select('assigned_to').eq('id', ev.action_id).maybeSingle()
    visible = !!a && canSeeAction(req, a)
  }
  if (!visible) {
    res.status(404).json({ error: 'evidence not found' })
    return null
  }
  return ev
}

function publicEvidence(ev: any) {
  const { step_submissions, ...rest } = ev
  const sub = Array.isArray(step_submissions) ? step_submissions[0] : step_submissions
  return { ...rest, step_id: sub?.step_id ?? null }
}

// ── Dépôt d'un fichier de preuve ────────────────────────────────────────────
// Corps = octets bruts ; Content-Type = type du fichier.
// Query : action_id (obligatoire), step_id, filename ; en-tête X-Checksum-SHA256 (vérifié).
const uploadQuery = z.object({
  action_id: z.string().uuid(),
  step_id: z.string().min(1).max(200).optional(),
  filename: z.string().max(300).optional(),
})

router.post(
  '/upload',
  requireAuth, requireTenant, requirePermission('evidence.upload'),
  raw({ type: () => true, limit: MAX_BYTES }),
  async (req: AuthedRequest, res) => {
    const q = uploadQuery.safeParse(req.query)
    if (!q.success) return res.status(400).json({ error: 'invalid query', details: q.error.flatten() })
    const { action_id, step_id } = q.data
    const tenantId = req.user!.tenant_id!
    if (!Buffer.isBuffer(req.body)) {
      return res.status(415).json({ error: 'corps binaire attendu', code: 'ERR_EVIDENCE_TYPE' })
    }
    const body: Buffer = req.body

    // 1. type, signature, taille — avant tout accès base
    const file = checkFile(req.headers['content-type'], body, MAX_BYTES)
    if (!file.ok) return res.status(file.status).json({ error: file.message, code: file.code })

    // 2. action du tenant, visible de l'utilisateur, encore ouverte aux preuves
    const { data: action } = await supabaseAdmin
      .from('actions')
      .select('id, action_def_id, assigned_to, status')
      .eq('id', action_id)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (!action || !canSeeAction(req, action)) return res.status(404).json({ error: 'action not found' })
    const manager = canSeeAllActions(req)
    if (TERMINAL.includes(action.status) || (action.status === 'submitted' && !manager)) {
      return res.status(409).json({ error: `dépôt impossible : statut ${action.status}`, code: 'ERR_ACTION_STATUS' })
    }

    // 3. étape (optionnelle) de la définition de CETTE action ; rattachement à la saisie existante
    let stepSubmissionId: string | null = null
    if (step_id) {
      const { data: step } = await supabaseAdmin
        .from('workflow_steps').select('id').eq('id', step_id).eq('action_id', action.action_def_id).maybeSingle()
      if (!step) return res.status(404).json({ error: 'step not found in this action' })
      const { data: sub } = await supabaseAdmin
        .from('step_submissions').select('id').eq('action_id', action_id).eq('step_id', step_id).maybeSingle()
      stepSubmissionId = sub?.id ?? null
    }

    // 4. empreinte : calculée par le serveur, confrontée à celle du client
    const checksum = sha256Hex(body)
    const claimed = req.headers['x-checksum-sha256']
    if (claimed !== undefined) {
      if (!isSha256Hex(claimed) || String(claimed).toLowerCase() !== checksum) {
        return res.status(422).json({
          error: "l'empreinte SHA-256 annoncée ne correspond pas au fichier reçu (transfert altéré)",
          code: 'ERR_EVIDENCE_CHECKSUM',
        })
      }
    }

    // 5. stockage sous un chemin décidé par le serveur, puis enregistrement
    const evidenceId = randomUUID()
    const filename = sanitizeFilename(q.data.filename)
    const storagePath = buildStoragePath(tenantId, action_id, evidenceId, filename)
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, body, {
      contentType: file.mime,
      upsert: false,
    })
    if (upErr) {
      console.error('[evidence] stockage impossible:', upErr.message)
      return res.status(502).json({ error: 'stockage indisponible', code: 'ERR_EVIDENCE_STORAGE' })
    }

    const { data: ev, error } = await supabaseAdmin
      .from('evidence')
      .insert({
        id: evidenceId,
        tenant_id: tenantId,
        action_id,
        step_submission_id: stepSubmissionId,
        kind: file.mime.startsWith('image/') ? 'photo' : 'file',
        storage_path: storagePath,
        checksum,
        value: { filename, size: body.length, mime: file.mime },
        captured_by: req.user!.id,
      })
      .select('*, step_submissions(step_id)')
      .single()
    if (error || !ev) {
      // Pas d'objet orphelin sans ligne de preuve
      await supabaseAdmin.storage.from(BUCKET).remove([storagePath])
      return res.status(400).json({ error: error?.message ?? 'enregistrement impossible' })
    }

    await writeAudit({
      tenantId, actorId: req.user!.id, action: 'evidence.upload', entity: 'evidence', entityId: ev.id,
      payload: { action_id, step_id: step_id ?? null, filename, size: body.length, mime: file.mime, checksum },
    })
    res.status(201).json({ evidence: publicEvidence(ev) })
  },
)

// ── Preuves sans fichier (mesure / saisie texte) ────────────────────────────
// Les preuves « file » et « photo » passent EXCLUSIVEMENT par /upload : le client
// ne choisit plus de chemin de stockage ni d'empreinte.
const valueEvidenceSchema = z.object({
  action_id: z.string().uuid(),
  step_id: z.string().min(1).max(200).optional(),
  kind: z.enum(['measure', 'text']),
  value: z.any().refine((v) => v !== undefined && v !== null, 'value requis'),
})

router.post('/', requireAuth, requireTenant, requirePermission('evidence.upload'), async (req: AuthedRequest, res) => {
  if (['file', 'photo'].includes(String(req.body?.kind))) {
    return res.status(400).json({
      error: 'les preuves fichier/photo se déposent via POST /evidence/upload (le fichier est stocké et son empreinte vérifiée)',
      code: 'ERR_USE_UPLOAD',
    })
  }
  const parsed = valueEvidenceSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() })
  const { action_id, step_id, kind, value } = parsed.data
  const tenantId = req.user!.tenant_id!

  const { data: action } = await supabaseAdmin
    .from('actions').select('id, action_def_id, assigned_to, status').eq('id', action_id).eq('tenant_id', tenantId).maybeSingle()
  if (!action || !canSeeAction(req, action)) return res.status(404).json({ error: 'action not found' })
  if (TERMINAL.includes(action.status)) {
    return res.status(409).json({ error: `dépôt impossible : statut ${action.status}`, code: 'ERR_ACTION_STATUS' })
  }

  let stepSubmissionId: string | null = null
  if (step_id) {
    const { data: step } = await supabaseAdmin
      .from('workflow_steps').select('id').eq('id', step_id).eq('action_id', action.action_def_id).maybeSingle()
    if (!step) return res.status(404).json({ error: 'step not found in this action' })
    const { data: sub } = await supabaseAdmin
      .from('step_submissions').select('id').eq('action_id', action_id).eq('step_id', step_id).maybeSingle()
    stepSubmissionId = sub?.id ?? null
  }

  const { data, error } = await supabaseAdmin
    .from('evidence')
    .insert({
      tenant_id: tenantId,
      action_id,
      step_submission_id: stepSubmissionId,
      kind,
      value,
      captured_by: req.user!.id,
    })
    .select('*, step_submissions(step_id)')
    .single()
  if (error || !data) return res.status(400).json({ error: error?.message ?? 'enregistrement impossible' })

  await writeAudit({
    tenantId, actorId: req.user!.id, action: 'evidence.record', entity: 'evidence', entityId: data.id,
    payload: { action_id, step_id: step_id ?? null, kind },
  })
  res.status(201).json({ evidence: publicEvidence(data) })
})

// ── Liste des preuves d'une action ──────────────────────────────────────────
router.get('/', requireAuth, requireTenant, requirePermission('evidence.read'), async (req: AuthedRequest, res) => {
  const actionId = z.string().uuid().safeParse(req.query.action_id)
  if (!actionId.success) return res.status(400).json({ error: 'action_id (uuid) requis' })
  const { data: action } = await supabaseAdmin
    .from('actions').select('id, assigned_to').eq('id', actionId.data).eq('tenant_id', req.user!.tenant_id!).maybeSingle()
  if (!action || !canSeeAction(req, action)) return res.status(404).json({ error: 'action not found' })

  const { data, error } = await supabaseAdmin
    .from('evidence')
    .select('*, step_submissions(step_id)')
    .eq('action_id', action.id)
    .eq('tenant_id', req.user!.tenant_id!)
    .order('captured_at', { ascending: false })
  if (error) return res.status(400).json({ error: error.message })
  res.json({ evidence: (data ?? []).map(publicEvidence) })
})

// ── URL signée de téléchargement (courte durée) ─────────────────────────────
router.get('/:id/download', requireAuth, requireTenant, requirePermission('evidence.read'), async (req: AuthedRequest, res) => {
  const ev = await loadVisibleEvidence(req, res)
  if (!ev) return
  if (!ev.storage_path) return res.status(404).json({ error: 'cette preuve ne comporte pas de fichier' })
  const filename = (ev.value as any)?.filename ?? 'preuve'
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(ev.storage_path, SIGNED_URL_TTL_S, { download: filename })
  if (error || !data) return res.status(502).json({ error: 'fichier indisponible dans le stockage', code: 'ERR_EVIDENCE_STORAGE' })
  await writeAudit({
    tenantId: req.user!.tenant_id!, actorId: req.user!.id, action: 'evidence.download', entity: 'evidence', entityId: ev.id,
    payload: { expires_in: SIGNED_URL_TTL_S },
  })
  res.json({ url: data.signedUrl, expires_in: SIGNED_URL_TTL_S, filename, checksum: ev.checksum })
})

// ── Vérification d'intégrité : SHA-256 recalculé depuis le stockage ─────────
router.get('/:id/verify', requireAuth, requireTenant, requirePermission('evidence.read'), async (req: AuthedRequest, res) => {
  const ev = await loadVisibleEvidence(req, res)
  if (!ev) return
  if (!ev.storage_path || !ev.checksum) return res.status(404).json({ error: 'cette preuve ne comporte pas de fichier' })
  const { data: blob, error } = await supabaseAdmin.storage.from(BUCKET).download(ev.storage_path)
  if (error || !blob) {
    return res.json({ intact: false, reason: 'missing', expected: ev.checksum, actual: null })
  }
  const actual = sha256Hex(Buffer.from(await blob.arrayBuffer()))
  const intact = actual === ev.checksum
  if (!intact) {
    await writeAudit({
      tenantId: req.user!.tenant_id!, actorId: req.user!.id, action: 'evidence.integrity_failed', entity: 'evidence', entityId: ev.id,
      payload: { expected: ev.checksum, actual },
    })
  }
  res.json({ intact, reason: intact ? null : 'checksum_mismatch', expected: ev.checksum, actual })
})

router.get('/:id', requireAuth, requireTenant, requirePermission('evidence.read'), async (req: AuthedRequest, res) => {
  const ev = await loadVisibleEvidence(req, res)
  if (!ev) return
  res.json({ evidence: publicEvidence(ev) })
})

// Suppression destructrice de la chaîne de preuves — réservée à l'autorité qualité
// (capa.close : tenant_admin, quality_manager). Le fichier est retiré du stockage et
// l'opération est journalisée avec l'empreinte et le chemin supprimés.
router.delete('/:id', requireAuth, requireTenant, requirePermission('capa.close'), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenant_id!
  const { data: ev } = await supabaseAdmin
    .from('evidence').select('*').eq('id', req.params.id).eq('tenant_id', tenantId).maybeSingle()
  if (!ev) return res.status(404).json({ error: 'evidence not found' })

  const { error } = await supabaseAdmin.from('evidence').delete().eq('id', ev.id).eq('tenant_id', tenantId)
  if (error) return res.status(400).json({ error: error.message })
  if (ev.storage_path) {
    const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove([ev.storage_path])
    if (rmErr) console.error('[evidence] suppression du fichier impossible:', rmErr.message)
  }
  await writeAudit({
    tenantId, actorId: req.user!.id, action: 'evidence.delete', entity: 'evidence', entityId: ev.id,
    payload: { action_id: ev.action_id, storage_path: ev.storage_path, checksum: ev.checksum, kind: ev.kind },
  })
  res.json({ ok: true })
})

export const evidenceRouter: ExpressRouter = router
