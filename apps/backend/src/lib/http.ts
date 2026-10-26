import type { Response } from 'express'
import { z } from 'zod'

/**
 * M4 — réponses d'erreur homogènes : le détail d'une erreur PostgREST/SQL (noms de
 * colonnes, contraintes) est journalisé côté serveur, jamais renvoyé au client.
 */
interface DbErrorLike {
  message?: string
  code?: string
}

const PG_STATUS: Record<string, { status: number; error: string; code: string }> = {
  '23505': { status: 409, error: 'conflit : enregistrement déjà existant', code: 'ERR_CONFLICT' },
  '23503': { status: 409, error: 'référence invalide ou encore utilisée', code: 'ERR_REFERENCE' },
  '23514': { status: 400, error: 'valeur refusée par une règle de la base', code: 'ERR_INVALID_VALUE' },
  '23502': { status: 400, error: 'champ obligatoire manquant', code: 'ERR_INVALID_VALUE' },
  '22P02': { status: 400, error: 'format de valeur invalide', code: 'ERR_INVALID_VALUE' },
  '42501': { status: 403, error: 'opération interdite par la base', code: 'ERR_FORBIDDEN' },
}

/** Répond à une erreur de base de données sans en révéler le détail. */
export function dbFail(res: Response, error: DbErrorLike | null | undefined, context: string, fallbackStatus = 400) {
  console.error(`[db] ${context}:`, error?.code ?? '', error?.message ?? error)
  const mapped = error?.code ? PG_STATUS[error.code] : undefined
  if (mapped) return res.status(mapped.status).json({ error: mapped.error, code: mapped.code })
  return res
    .status(fallbackStatus)
    .json({ error: fallbackStatus >= 500 ? 'erreur interne' : 'requête refusée', code: fallbackStatus >= 500 ? 'ERR_INTERNAL' : 'ERR_REQUEST_REFUSED' })
}

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
})

/** limit/offset validés ; valeurs invalides → erreur explicite, plus de `NaN`. */
export function parsePagination(query: unknown): { ok: true; limit: number; offset: number } | { ok: false; details: unknown } {
  const parsed = paginationSchema.safeParse(query ?? {})
  if (!parsed.success) return { ok: false, details: parsed.error.flatten() }
  return { ok: true, limit: parsed.data.limit, offset: parsed.data.offset }
}

/** Valide un corps de requête ; répond 400 (liste des champs en cause) en cas d'échec. */
export function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown, res: Response): z.infer<S> | null {
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success) {
    res.status(400).json({ error: 'payload invalide', code: 'ERR_INVALID_INPUT', details: parsed.error.flatten() })
    return null
  }
  return parsed.data
}
