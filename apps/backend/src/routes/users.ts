import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { z } from 'zod'
import { requireAuth, requireTenant, requirePermission, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { auditFromReq } from '../lib/audit'
import { dbFail } from '../lib/http'
import { listAllAuthUsers } from '../lib/authUsers'
import { invalidateAuthCache } from '../middleware/auth'

/**
 * §3.4 Gestion des utilisateurs — tout est gate par user.manage
 * (détenu par tenant_admin, super_admin, technical_admin — V5 §3.3).
 * Invitations via GoTrue (lien expirant et à usage unique, aucun mot de passe
 * en clair), suspension = ban GoTrue (révoque les sessions) + is_active profil,
 * historique des changements de rôle tracé dans user_role_history.
 */
const router: ExpressRouter = Router()

/** Codes GoTrue d'un quota atteint (erreur temporaire, à distinguer d'un refus définitif). */
const INVITE_RATE_LIMIT_CODES = new Set(['over_email_send_rate_limit', 'over_request_rate_limit'])

const TENANT_ROLES = [
  'tenant_admin', 'quality_manager', 'site_manager', 'department_manager',
  'process_owner', 'operator', 'internal_auditor', 'external_auditor',
  'consultant', 'reader',
] as const

const inviteInput = z.object({
  email: z.string().email(),
  role: z.enum(TENANT_ROLES),
  display_name: z.string().min(1).max(120).optional(),
})

const patchInput = z.object({
  role: z.enum(TENANT_ROLES).optional(),
  display_name: z.string().min(1).max(120).optional(),
  reason: z.string().max(500).optional(),
})

function audit(req: AuthedRequest, action: string, entityId: string, payload: Record<string, unknown> = {}) {
  return auditFromReq(req, action, 'user', entityId, payload)
}

/** Profil du tenant courant — masque les utilisateurs des autres tenants (404). */
async function loadTenantProfile(id: string, req: AuthedRequest, res: any) {
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('*')
    .eq('id', id)
    .single()
  if (!profile || profile.tenant_id !== req.user?.tenant_id) {
    res.status(404).json({ error: 'user not found' })
    return null
  }
  return profile
}

// ── Liste des utilisateurs du tenant ────────────────────────────────────────
router.get('/', requireAuth, requireTenant, requirePermission('user.manage'), async (req: AuthedRequest, res) => {
  const { data: profiles, error } = await supabaseAdmin
    .from('user_profiles')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id!)
    .order('created_at')
  if (error) return dbFail(res, error, 'users', 500)

  const byId = new Map((await listAllAuthUsers()).map((u) => [u.id, u]))

  res.json({
    users: (profiles ?? []).map((p) => ({
      id: p.id,
      email: byId.get(p.id)?.email ?? null,
      display_name: p.display_name,
      role: p.role,
      is_active: p.is_active,
      suspended_at: p.suspended_at,
      last_sign_in_at: byId.get(p.id)?.last_sign_in_at ?? null,
      created_at: p.created_at,
    })),
  })
})

// ── Détail + historique des changements de rôle (§3.4) ──────────────────────
router.get('/:id', requireAuth, requireTenant, requirePermission('user.manage'), async (req: AuthedRequest, res) => {
  const profile = await loadTenantProfile(req.params.id, req, res)
  if (!profile) return
  const { data: history } = await supabaseAdmin
    .from('user_role_history')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(50)
  res.json({ user: profile, role_history: history ?? [] })
})

// ── Invitation par e-mail (lien GoTrue : expirant, à usage unique) ──────────
router.post('/invite', requireAuth, requireTenant, requirePermission('user.manage'), async (req: AuthedRequest, res) => {
  const parsed = inviteInput.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid invite payload', details: parsed.error.flatten() })
  }
  const { email, role, display_name } = parsed.data

  const { data: invited, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { role },
  })
  if (invErr) {
    const msg = invErr.message ?? ''
    if (/already|exist/i.test(msg)) {
      return res.status(409).json({ error: `utilisateur déjà existant: ${email}` })
    }
    console.error('[users] invite:', msg)
    // Quota d'e-mails du fournisseur (GoTrue cloud ~1/h) : erreur TEMPORAIRE et
    // réessayable — 429 avec code distinct, pour ne pas masquer un problème
    // transitoire derrière un 400 « refus définitif » (E2E distant PV §6.1).
    // Détection sur les champs structurés de l'erreur GoTrue (status/code), pas sur le
    // texte du message ; pas de Retry-After : le fournisseur n'expose aucune durée d'attente.
    if (invErr.status === 429 || INVITE_RATE_LIMIT_CODES.has(invErr.code ?? '')) {
      return res.status(429).json({
        error: "quota d'envoi d'e-mails du fournisseur d'identité atteint — réessayer plus tard",
        code: 'ERR_INVITE_RATE_LIMIT',
      })
    }
    return res.status(400).json({ error: "invitation refusée par le fournisseur d'identité", code: 'ERR_INVITE' })
  }
  const uid = invited.user?.id
  if (!uid) return res.status(500).json({ error: 'invitation GoTrue sans utilisateur' })

  const { error: profErr } = await supabaseAdmin.from('user_profiles').upsert({
    id: uid,
    tenant_id: req.user!.tenant_id!,
    role,
    display_name: display_name ?? null,
  })
  if (profErr) return dbFail(res, profErr, 'users', 400)

  await audit(req, 'user.invite', uid, { email, role })
  res.status(201).json({
    user: { id: uid, email, role, display_name: display_name ?? null, is_active: true },
  })
})

// ── Modification rôle / nom affiché + historique (§3.4) ─────────────────────
router.patch('/:id', requireAuth, requireTenant, requirePermission('user.manage'), async (req: AuthedRequest, res) => {
  const parsed = patchInput.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() })
  }
  const input = parsed.data
  const profile = await loadTenantProfile(req.params.id, req, res)
  if (!profile) return
  if (!input.role && input.display_name === undefined) {
    return res.status(400).json({ error: 'role ou display_name requis' })
  }

  const now = new Date().toISOString()
  if (input.role && input.role !== profile.role) {
    const { error: hErr } = await supabaseAdmin.from('user_role_history').insert({
      tenant_id: profile.tenant_id,
      user_id: profile.id,
      old_role: profile.role,
      new_role: input.role,
      changed_by: req.user?.id ?? null,
      reason: input.reason ?? null,
    })
    if (hErr) return dbFail(res, hErr, 'users', 400)
  }

  const { error: uErr } = await supabaseAdmin
    .from('user_profiles')
    .update({
      ...(input.role ? { role: input.role } : {}),
      ...(input.display_name !== undefined ? { display_name: input.display_name } : {}),
      updated_at: now,
    })
    .eq('id', profile.id)
  if (uErr) return dbFail(res, uErr, 'users', 400)

  invalidateAuthCache(profile.id)
  await audit(req, 'user.update', profile.id, { role: input.role, display_name: input.display_name, reason: input.reason })
  res.json({
    user: {
      ...profile,
      ...(input.role ? { role: input.role } : {}),
      ...(input.display_name !== undefined ? { display_name: input.display_name } : {}),
      updated_at: now,
    },
  })
})

// ── Suspension (§3.4 : désactivation + révocation des sessions) ─────────────
// Ban GoTrue → le token de l'utilisateur est refusé par getUser (sessions mortes),
// is_active=false trace l'état côté profil pour l'UI.
router.post('/:id/deactivate', requireAuth, requireTenant, requirePermission('user.manage'), async (req: AuthedRequest, res) => {
  const profile = await loadTenantProfile(req.params.id, req, res)
  if (!profile) return
  if (!profile.is_active) return res.status(409).json({ error: 'utilisateur déjà suspendu' })
  if (profile.id === req.user?.id) return res.status(409).json({ error: 'impossible de se suspendre soi-même' })

  const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
    ban_duration: '876600h', // ≈ 100 ans — levé par activate
  })
  if (banErr) return dbFail(res, banErr, 'users', 400)

  const now = new Date().toISOString()
  const { error: uErr } = await supabaseAdmin
    .from('user_profiles')
    .update({ is_active: false, suspended_at: now, suspended_by: req.user?.id ?? null, updated_at: now })
    .eq('id', profile.id)
  if (uErr) return dbFail(res, uErr, 'users', 400)

  invalidateAuthCache(profile.id)
  await audit(req, 'user.deactivate', profile.id)
  res.json({ user: { id: profile.id, is_active: false, suspended_at: now } })
})

// ── Réactivation (lève le ban) ──────────────────────────────────────────────
router.post('/:id/activate', requireAuth, requireTenant, requirePermission('user.manage'), async (req: AuthedRequest, res) => {
  const profile = await loadTenantProfile(req.params.id, req, res)
  if (!profile) return
  if (profile.is_active) return res.status(409).json({ error: 'utilisateur déjà actif' })

  const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
    ban_duration: 'none',
  })
  if (banErr) return dbFail(res, banErr, 'users', 400)

  const now = new Date().toISOString()
  const { error: uErr } = await supabaseAdmin
    .from('user_profiles')
    .update({ is_active: true, suspended_at: null, suspended_by: null, updated_at: now })
    .eq('id', profile.id)
  if (uErr) return dbFail(res, uErr, 'users', 400)

  invalidateAuthCache(profile.id)
  await audit(req, 'user.activate', profile.id)
  res.json({ user: { id: profile.id, is_active: true, suspended_at: null } })
})

export const usersRouter: ExpressRouter = router


