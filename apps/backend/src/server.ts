import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import 'express-async-errors'

dotenv.config()

import { actionsRouter } from './routes/actions'
import { stepsRouter } from './routes/steps'
import { aiRouter } from './routes/ai'
import { evidenceRouter } from './routes/evidence'
import { nonconformitiesRouter } from './routes/nonconformities'
import { dashboardRouter } from './routes/dashboard'
import { auditRouter } from './routes/audit'
import { tenantsRouter } from './routes/tenants'
import { matrixRouter } from './routes/matrix'
import { workflowsRouter } from './routes/workflows'
import { usersRouter } from './routes/users'
import { notificationsRouter } from './routes/notifications'
import { reportsRouter } from './routes/reports'
import { documentsRouter } from './routes/documents'
import { auditsRouter } from './routes/audits'
import { reviewsRouter } from './routes/reviews'
import { requireAuth, AuthedRequest } from './middleware/auth'
import { supabaseAdmin } from './lib/supabase'
import { rateLimit } from './lib/rateLimiter'
import { parseTrustProxy } from './lib/trustProxy'

const app: express.Application = express()
const PORT = Number(process.env.PORT ?? 4000)

// Derrière un reverse proxy : TRUST_PROXY=<nombre de proxys> pour que req.ip (et donc la
// limitation de débit par IP) soit l'adresse du client et non celle du proxy.
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY))

/**
 * Origines CORS autorisées (V5 §15).
 * - CORS_ORIGIN : liste d'origines séparées par des virgules (prioritaire).
 * - défaut : origines de développement locales (vite dev 5173/5174).
 * En production, CORS_ORIGIN DOIT être défini explicitement (une seule
 * origine) — cf. docs/DEPLOIEMENT.md.
 */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(helmet())
app.use(
  cors({
    origin: (origin, callback) => {
      // Requêtes sans en-tête Origin (curl, tests unitaires, healthcheck) : autorisées.
      if (!origin) return callback(null, true)
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true)
      // Origine refusée : pas d'en-tête Access-Control-Allow-Origin.
      return callback(null, false)
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '2mb' }))

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'iso-backend', time: new Date().toISOString() })
})

// API v1 — limitation de débit (§15) : fenêtre fixe par IP, generous enough
// pour le dev et l'E2E ; 429 + Retry-After au-delà. S'applique à TOUT /api/v1, y compris
// /me (2-3 appels Supabase par requête, donc le plus coûteux à laisser ouvert).
// RATE_LIMIT_API permet d'ajuster la fenêtre sans redéploiement.
const API_RATE_LIMIT = Number(process.env.RATE_LIMIT_API ?? 600)
const API_RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000)
app.use('/api/v1', rateLimit({ limit: API_RATE_LIMIT, windowMs: API_RATE_WINDOW_MS }))

// Session courante + permissions RBAC (V5 §3.3) — alimente le gating frontend
// (usePermissions) sans jamais faire confiance au rôle déclaré côté client.
app.get('/api/v1/me', requireAuth, async (req, res) => {
  const r = req as AuthedRequest
  const role = r.user?.role ?? ''
  const isPlatformAdmin = role === 'super_admin' || role === 'technical_admin'

  let permissions: string[]
  if (isPlatformAdmin) {
    // Bypass total : renvoyer l'ensemble des permissions (source de vérité)
    const { data } = await supabaseAdmin.from('permissions').select('code')
    permissions = (data ?? []).map((p) => p.code)
  } else {
    permissions = Array.from(r.permissions ?? [])
  }

  res.json({ user: r.user, permissions })
})

app.use('/api/v1/tenants', tenantsRouter)
app.use('/api/v1/auth', (req, res) => {
  res.status(404).json({ error: 'auth routes handled by Supabase client' })
})
app.use('/api/v1/actions', actionsRouter)
app.use('/api/v1/steps', stepsRouter)
app.use('/api/v1/ai', aiRouter)
app.use('/api/v1/evidence', evidenceRouter)
app.use('/api/v1/nonconformities', nonconformitiesRouter)
app.use('/api/v1/dashboard', dashboardRouter)
app.use('/api/v1/audit-log', auditRouter)
// Matrice de traçabilité ISO 9001:2026 (V4 — annexes K & L)
app.use('/api/v1/matrix', matrixRouter)
// Module B — Bibliothèque de workflows (V5 §5.2)
app.use('/api/v1/workflows', workflowsRouter)
// §3.4 Gestion des utilisateurs (user.manage)
app.use('/api/v1/users', usersRouter)
// Module G — Notifications internes (V5 §5.7)
app.use('/api/v1/notifications', notificationsRouter)
// Module H — Rapports et préparation d'audit (V5 §5.8)
app.use('/api/v1/reports', reportsRouter)
// §8.6 Documents contrôlés
app.use('/api/v1/documents', documentsRouter)
// §9.2 Audits internes + §9.3 Revues de direction (P5 final)
app.use('/api/v1/audits', auditsRouter)
app.use('/api/v1/reviews', reviewsRouter)

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'not found' })
})

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  const status = err.statusCode ?? 500
  res.status(status).json({ error: err.message ?? 'Internal Server Error' })
})

app.listen(PORT, () => {
  console.log(`ISO backend listening on http://localhost:${PORT}`)
})

export default app
