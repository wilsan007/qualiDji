/**
 * Tests unitaires — /health et perte d'évènements d'audit (H4).
 *
 * Vérifie que la sonde répond 200 « ok » tant que la piste d'audit est saine,
 * puis 503 « degraded » dès qu'une écriture du journal a échoué (writeAudit
 * comptabilise l'échec après sa nouvelle tentative). Une URL Supabase
 * volontairement injoignable simule la panne de la base d'audit.
 *
 * Exécution : pnpm --filter @iso/backend test:health
 */
import type { AddressInfo } from 'net'

let passed = 0
let failed = 0
function assert(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function main() {
  // Avant TOUT import de lib/supabase (dotenv ne surcharge pas les variables déjà posées) :
  // URL injoignable → chaque écriture d'audit échoue après nouvelle tentative.
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.SUPABASE_ANON_KEY = 'test-anon'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service'

  const { writeAudit, auditFailureCount } = await import('../src/lib/audit')
  const { healthRouter } = await import('../src/routes/health')
  const express = (await import('express')).default

  const app = express()
  app.use('/health', healthRouter)
  const srv = await new Promise<{ base: string; close: () => void }>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () =>
      resolve({ base: `http://127.0.0.1:${(s.address() as AddressInfo).port}/health`, close: () => s.close() }),
    )
  })

  console.log('— /health sur une piste d\'audit saine —')
  const ok = await (await fetch(srv.base)).json() as { status: string; audit_write_failures: number }
  assert("aucun échec → 200 « ok », audit_write_failures = 0", ok.status === 'ok' && ok.audit_write_failures === 0, JSON.stringify(ok))

  console.log('— perte d\'un évènement d\'audit (base injoignable) —')
  const written = await writeAudit({ tenantId: 't-e2e', actorId: 'u-e2e', action: 'health.test', entity: 'test', entityId: 'x' })
  assert('writeAudit signale l\'échec (false, sans lever d\'exception)', written === false)
  assert('le compteur d\'échecs est incrémenté', auditFailureCount() >= 1, String(auditFailureCount()))

  const res = await fetch(srv.base)
  const body = await res.json() as { status: string; audit_write_failures: number; hint?: string }
  assert('/health répond 503 (échec de supervision, pas de 200 masqué)', res.status === 503, String(res.status))
  assert("status « degraded » + audit_write_failures ≥ 1 + indication [audit-lost]", body.status === 'degraded' && body.audit_write_failures >= 1 && Boolean(body.hint), JSON.stringify(body))

  srv.close()
  console.log(`\nRésultat santé/audit : ${passed} réussis, ${failed} échec(s).`)
  if (failed > 0) process.exit(1)
}
void main()
