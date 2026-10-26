import type { Request, Response, NextFunction } from 'express'

/**
 * §15 — Exigences non fonctionnelles : limitation de débit simple, sans
 * dépendance, en mémoire (fenêtre fixe par IP). Suffisant pour un déploiement
 * single-instance ; au-delà, remplacer par un store partagé (Redis) sans
 * changer l'interface. Le health check (/health) est hors API et non limité.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** @returns true si la requête est autorisée (et comptée). */
  hit(key: string): boolean {
    const t = this.now()
    const entry = this.hits.get(key)
    if (!entry || t >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs })
      return true
    }
    if (entry.count >= this.limit) return false
    entry.count++
    return true
  }

  /** Milliseconds avant la prochaine fenêtre pour cette clé (pour Retry-After). */
  retryAfterMs(key: string): number {
    const entry = this.hits.get(key)
    if (!entry) return this.windowMs
    return Math.max(1000, entry.resetAt - this.now())
  }

  /** Nettoyage des fenêtres expirées (appelé périodiquement). */
  sweep(): void {
    const t = this.now()
    for (const [key, entry] of this.hits) {
      if (t >= entry.resetAt) this.hits.delete(key)
    }
  }

  get size(): number {
    return this.hits.size
  }
}

/** Middleware Express : 429 + Retry-After au-delà de la limite. */
export function rateLimit(opts: { limit: number; windowMs: number }) {
  const limiter = new RateLimiter(opts.limit, opts.windowMs)
  // Nettoyage paresseux, déclenché par les requêtes : aucune minuterie au chargement du module
  // (interdite dans la portée globale de Cloudflare Workers), même cadence que l'ancien setInterval.
  const sweepEveryMs = Math.max(30_000, opts.windowMs)
  let nextSweepAt = Date.now() + sweepEveryMs
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now()
    if (now >= nextSweepAt) {
      limiter.sweep()
      nextSweepAt = now + sweepEveryMs
    }
    const key = req.ip ?? 'unknown'
    if (limiter.hit(key)) return next()
    res.setHeader('Retry-After', String(Math.ceil(limiter.retryAfterMs(key) / 1000)))
    res.status(429).json({
      error: 'trop de requêtes — réessayez plus tard',
      code: 'ERR_RATE_LIMITED',
    })
  }
}
