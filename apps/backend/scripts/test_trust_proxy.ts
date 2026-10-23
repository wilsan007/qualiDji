/**
 * Tests unitaires — configuration du reverse proxy (H5) : parsing strict de TRUST_PROXY
 * et effet réel sur req.ip / la limitation de débit via une vraie app Express éphémère.
 * Exécution : npm run test:deploy
 */
import express from 'express'
import type { AddressInfo } from 'net'
import { parseTrustProxy } from '../src/lib/trustProxy'
import { rateLimit } from '../src/lib/rateLimiter'

let passed = 0
let failed = 0
function assert(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const throws = (v: string) => { try { parseTrustProxy(v); return false } catch { return true } }

console.log('— parsing de TRUST_PROXY —')
assert('vide / absent / false / 0 → false', [undefined, '', ' ', 'false', '0'].every((v) => parseTrustProxy(v) === false))
assert('entier → nombre de proxys', parseTrustProxy('1') === 1 && parseTrustProxy('2') === 2)
assert('mots-clés et CIDR acceptés', parseTrustProxy('loopback') === 'loopback' && parseTrustProxy('10.0.0.0/8, 192.168.1.5') === '10.0.0.0/8,192.168.1.5' && parseTrustProxy('loopback,uniquelocal') === 'loopback,uniquelocal')
assert("'true' refusé (confiance totale = usurpation d'IP)", throws('true'))
assert('valeurs invalides refusées', throws('yes') && throws('1.2.3.4.5/abc') && throws('11') && throws('<script>'))

async function hit(base: string, xff?: string): Promise<number> {
  const r = await fetch(base, xff ? { headers: { 'X-Forwarded-For': xff } } : undefined)
  return r.status
}
function serve(trust: ReturnType<typeof parseTrustProxy>, limit: number) {
  const app = express()
  app.set('trust proxy', trust)
  app.use('/api/v1', rateLimit({ limit, windowMs: 60_000 }))
  app.get('/api/v1/me', (req, res) => res.json({ ip: req.ip }))
  return new Promise<{ base: string; close: () => void }>((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/v1/me`, close: () => srv.close() }))
  })
}

async function main() {
  console.log('— effet sur la limitation de débit (app Express réelle) —')
  // Sans proxy de confiance : X-Forwarded-For est ignoré → impossible de contourner la limite en usurpant l'IP
  const a = await serve(parseTrustProxy(''), 2)
  const sA = [await hit(a.base, '1.1.1.1'), await hit(a.base, '2.2.2.2'), await hit(a.base, '3.3.3.3')]
  assert("sans TRUST_PROXY : XFF ignoré, 3e requête (IPs usurpées différentes) → 429", sA.join() === '200,200,429', sA.join())
  a.close()

  // Un proxy de confiance : le quota est par client réel (1re valeur de XFF ajoutée par le proxy)
  const b = await serve(parseTrustProxy('1'), 2)
  const sB = [await hit(b.base, '1.1.1.1'), await hit(b.base, '1.1.1.1'), await hit(b.base, '1.1.1.1'), await hit(b.base, '2.2.2.2')]
  assert('TRUST_PROXY=1 : un client épuisé (429) n’affecte pas un autre client', sB.join() === '200,200,429,200', sB.join())
  const ip = await (await fetch(b.base, { headers: { 'X-Forwarded-For': '9.9.9.9' } })).json() as { ip: string }
  assert('TRUST_PROXY=1 : req.ip = adresse du client, pas du proxy', ip.ip === '9.9.9.9', ip.ip)
  b.close()

  // Sans la config, derrière un proxy tous les clients partagent le quota (le défaut corrigé)
  const c = await serve(false, 2)
  const sC = [await hit(c.base), await hit(c.base), await hit(c.base)]
  assert('/me (route sous /api/v1) est bien soumise au limiteur', sC.join() === '200,200,429', sC.join())
  c.close()

  console.log(`\nRésultat déploiement : ${passed} réussis, ${failed} échec(s).`)
  if (failed > 0) process.exit(1)
}
void main()
