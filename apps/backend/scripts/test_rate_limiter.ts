/**
 * Tests unitaires — limitation de débit (§15).
 * Horloge injectée : aucune attente réelle.
 * Exécution : npm run test:hardening
 */
import { RateLimiter } from '../src/lib/rateLimiter'

let passed = 0
let failed = 0

function assert(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// Horloge factice
let clock = 1_000_000
const now = () => clock

const limiter = new RateLimiter(3, 10_000, now)

assert('3 requêtes dans la fenêtre → autorisées', limiter.hit('ip1') && limiter.hit('ip1') && limiter.hit('ip1'))
assert('4e requête → refusée', !limiter.hit('ip1'))
assert('autre IP indépendante → autorisée', limiter.hit('ip2'))
assert('retry-after positif avant reset', limiter.retryAfterMs('ip1') > 0 && limiter.retryAfterMs('ip1') <= 10_000)

clock += 10_001
assert('après la fenêtre → autorisé à nouveau', limiter.hit('ip1'))
assert('sweep nettoie les fenêtres expirées', (limiter.sweep(), limiter.size <= 2))

const limiter2 = new RateLimiter(1, 60_000, now)
assert('limite=1 : première seule autorisée', limiter2.hit('k') && !limiter2.hit('k'))

console.log(`\nRésultat hardening : ${passed} réussis, ${failed} échec(s).`)
if (failed > 0) process.exit(1)
