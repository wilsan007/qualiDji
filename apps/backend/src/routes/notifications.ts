import { Router } from 'express'
import type { Router as ExpressRouter } from 'express'
import { requireAuth, requireTenant, AuthedRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabase'
import { dbFail, parsePagination } from '../lib/http'

/**
 * Module G — Notifications internes (V5 §5.7).
 * Chaque utilisateur gère SA boîte : auth + tenant scoping strict
 * (user_id = appelant), aucune permission RBAC spécifiée par la spec —
 * l'isolation vient du filtre user_id + RLS notifications_*_own (0010).
 */
const router: ExpressRouter = Router()

// ── Boîte de réception : mes notifications + compte non-lues ────────────────
router.get('/', requireAuth, requireTenant, async (req: AuthedRequest, res) => {
  const user = req.user
  if (!user) return res.status(401).json({ error: 'unauthenticated' })
  const page = parsePagination(req.query)
  if (!page.ok) return res.status(400).json({ error: 'pagination invalide', code: 'ERR_INVALID_INPUT', details: page.details })
  const limit = Math.min(page.limit, 100)

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(page.offset, page.offset + limit - 1)
  if (error) return dbFail(res, error, 'notifications', 500)

  const unread = (data ?? []).filter((n) => !n.read_at).length
  res.json({ notifications: data ?? [], unread_count: unread })
})

// ── Marquer toutes comme lues ───────────────────────────────────────────────
router.post('/read-all', requireAuth, requireTenant, async (req: AuthedRequest, res) => {
  const user = req.user
  if (!user) return res.status(401).json({ error: 'unauthenticated' })
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)
  if (error) return dbFail(res, error, 'notifications', 500)
  res.json({ ok: true })
})

// ── Marquer une notification comme lue (la mienne uniquement) ───────────────
router.post('/:id/read', requireAuth, requireTenant, async (req: AuthedRequest, res) => {
  const user = req.user
  if (!user) return res.status(401).json({ error: 'unauthenticated' })
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', user.id)
    .is('read_at', null)
    .select()
    .maybeSingle()
  if (error) return dbFail(res, error, 'notifications', 500)
  if (!data) {
    // Inexistante OU appartenant à un autre utilisateur → même réponse (pas d'énumération)
    return res.status(404).json({ error: 'notification not found' })
  }
  res.json({ notification: data })
})

export const notificationsRouter: ExpressRouter = router
