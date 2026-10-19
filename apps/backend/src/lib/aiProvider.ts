import { createHash } from 'crypto'

/**
 * §7.7 Gestion du fournisseur IA — interface indépendante du fournisseur,
 * avec timeouts, limites de taille, retry borné, circuit breaker et métriques.
 * Aucun secret fournisseur ne transite jamais par le navigateur : appel serveur
 * exclusivement. Sans configuration, le provider statique (fallback §7.5 R6)
 * est utilisé — le module reste fonctionnel hors-ligne et sans clé API.
 */

export interface AIGenerateRequest {
  /** Instructions système (règles métier et garde-fous §7.1/§7.5). */
  system: string
  /** Contexte minimal encodé en JSON (§7.3 « ne transmettre que les champs utiles »). */
  user: string
  /** Indice de schéma transmis au fournisseur (contrat §7.4). */
  schemaHint: string
}

export interface AIGenerateResult {
  text: string
  model: string
  latencyMs: number
}

export interface AIProvider {
  readonly name: string
  generate(req: AIGenerateRequest): Promise<AIGenerateResult>
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** Circuit breaker : après N échecs consécutifs, le circuit s'ouvre pendant pauseMs. */
export class CircuitBreaker {
  private failures = 0
  private openedAt = 0

  constructor(
    private readonly threshold = 3,
    private readonly pauseMs = 60_000,
  ) {}

  get isOpen(): boolean {
    return this.failures >= this.threshold && Date.now() - this.openedAt < this.pauseMs
  }

  recordSuccess(): void {
    this.failures = 0
  }

  recordFailure(): void {
    this.failures++
    if (this.failures >= this.threshold) this.openedAt = Date.now()
  }

  /** Exposé pour les tests unitaires. */
  get failureCount(): number {
    return this.failures
  }
}

/** Provider de secours (§7.5 R6) : déterministe, aucune donnée ne sort du serveur. */
export class TemplateAIProvider implements AIProvider {
  readonly name = 'template'

  async generate(req: AIGenerateRequest): Promise<AIGenerateResult> {
    // Reproduit la structure attendue ; le contenu est assemblé par la route
    // à partir des steps définis — ce provider ne fait que confirmer le mode.
    const started = Date.now()
    return {
      text: JSON.stringify({ template: true, echo: req.user.slice(0, 200) }),
      model: 'template-fallback',
      latencyMs: Date.now() - started,
    }
  }
}

/** Provider HTTP compatible OpenAI (chat/completions), piloté par variables d'env. */
export class HttpAIProvider implements AIProvider {
  readonly name = 'http-openai'

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly maxUserChars: number,
  ) {}

  async generate(req: AIGenerateRequest): Promise<AIGenerateResult> {
    const started = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: 700,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user.slice(0, this.maxUserChars) },
          ],
        }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`provider HTTP ${res.status}`)
      const data: any = await res.json()
      const text = data?.choices?.[0]?.message?.content
      if (typeof text !== 'string' || !text) throw new Error('provider: réponse vide')
      return { text, model: data?.model ?? this.model, latencyMs: Date.now() - started }
    } finally {
      clearTimeout(timer)
    }
  }
}

let breaker = new CircuitBreaker()

/** Réinitialise le circuit breaker (tests). */
export function resetCircuitBreaker(): void {
  breaker = new CircuitBreaker()
}

export function getCircuitBreaker(): CircuitBreaker {
  return breaker
}

/**
 * Sélectionne le provider : HTTP si configuré (AI_PROVIDER_URL + AI_API_KEY),
 * sinon template. Le circuit breaker refuse d'appeler un provider HTTP tant
 * qu'il est ouvert (R6 : on passe directement en mode dégradé).
 */
export function getProvider(): { provider: AIProvider; http: boolean } {
  const url = process.env.AI_PROVIDER_URL
  const key = process.env.AI_API_KEY
  if (url && key) {
    const provider = new HttpAIProvider(
      url,
      key,
      process.env.AI_MODEL ?? 'gpt-4o-mini',
      Number(process.env.AI_TIMEOUT_MS ?? 10_000),
      Number(process.env.AI_MAX_USER_CHARS ?? 6_000),
    )
    return { provider, http: true }
  }
  return { provider: new TemplateAIProvider(), http: false }
}

/** Appel avec retry borné (1) — renvoie null si le circuit est ouvert ou si tout échoue. */
export async function callProvider(req: AIGenerateRequest): Promise<{ result: AIGenerateResult; http: boolean } | null> {
  const { provider, http } = getProvider()
  if (http && breaker.isOpen) return null
  const attempts = http ? 2 : 1
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await provider.generate(req)
      if (http) breaker.recordSuccess()
      return { result, http }
    } catch {
      if (http) breaker.recordFailure()
    }
  }
  return null
}
