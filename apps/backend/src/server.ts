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
import { requireAuth, AuthedRequest } from './middleware/auth'
import { supabaseAdmin } from './lib/supabase'

const app: express.Application = express()
const PORT = Number(process.env.PORT ?? 4000)

app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '2mb' }))

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'iso-backend', time: new Date().toISOString() })
})

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

// API v1
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
