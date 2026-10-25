/**
 * Tests unitaires P6 — File de synchronisation hors ligne (V5 §13).
 * Logique pure importée depuis le frontend (aucune DB, aucun réseau).
 * Couvre : persistance, clé d'idempotence (pas de doublon d'opération),
 * rejeu FIFO avec préservation d'ordre, reprise après échec, plafond.
 * Exécution : npm run test:offline
 */
import { OfflineQueue, PendingMutation, QueueStorage } from '../../frontend/src/lib/offline/queue'

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

function memStorage(): QueueStorage & { data: PendingMutation[] } {
  const data: PendingMutation[] = []
  return {
    data,
    async load() {
      return [...data]
    },
    async save(items) {
      data.length = 0
      data.push(...items)
    },
  }
}

async function run() {
  console.log('\n— Persistance & idempotence —')
  const storage = memStorage()
  const sentLog: string[] = []
  const q = new OfflineQueue(storage, async (m) => {
    sentLog.push(m.idempotency_key)
  })

  await q.enqueue('step.submit', { value: 'v1' }, 'step.submit:A:S1')
  assert('enqueue → 1 en attente', (await q.size()) === 1)
  await q.enqueue('step.submit', { value: 'v2' }, 'step.submit:A:S1')
  assert('même clé d idempotence → pas de doublon, payload remplacé', (await q.size()) === 1)
  assert('persistance stockée', storage.data.length === 1)

  // Nouvelle instance = reprise après rechargement d onglet
  const q2 = new OfflineQueue(storage, async (m) => {
    sentLog.push(m.idempotency_key)
  })
  assert('nouvelle instance recharge la file persistée', (await q2.size()) === 1)

  console.log('\n— Flush & reprise —')
  const r1 = await q2.flush()
  assert('flush → 1 envoyé, file vide', r1.sent === 1 && r1.remaining === 0)
  assert('rejeu n a envoyé qu une fois', sentLog.length === 1)

  console.log('\n— Ordre FIFO préservé sur échec —')
  const storage2 = memStorage()
  let failFirst = true
  const order: string[] = []
  const q3 = new OfflineQueue(storage2, async (m) => {
    if (m.idempotency_key === 'A' && failFirst) throw new Error(' réseau coupé')
    order.push(m.idempotency_key)
  })
  await q3.enqueue('step.submit', { i: 1 }, 'A')
  await q3.enqueue('step.submit', { i: 2 }, 'B')
  const rf = await q3.flush()
  assert('échec tête de file → stop (B non sauté)', rf.sent === 0 && rf.failed === 1 && rf.remaining === 2)
  assert('aucun envoi partiel hors ordre', order.length === 0)
  failFirst = false
  const rs = await q3.flush()
  assert('reprise complète dans l ordre A→B', rs.sent === 2 && order.join(',') === 'A,B')

  console.log('\n— Idempotence métier du rejeu —')
  // Re-soumission de la même étape (clé stable) → un seul item, pas de doublon
  await q3.enqueue('step.submit', { value: 'x' }, 'step.submit:A1:ST1')
  await q3.enqueue('step.submit', { value: 'y' }, 'step.submit:A1:ST1')
  assert('ré-enregistrement même étape → payload le plus récent', (await q3.size()) === 1)
  const item = (await q3.list())[0]
  assert('payload = dernière valeur saisie', (item.payload as any).value === 'y')

  console.log('\n— Plafond —')
  const q4 = new OfflineQueue(memStorage(), async () => {}, 3)
  let refused = 0
  for (let i = 0; i < 5; i++) {
    try { await q4.enqueue('step.submit', { i }, `k${i}`) } catch { refused++ }
  }
  assert('plafond respecté (3 max)', (await q4.size()) === 3)
  assert('2 saisies refusées explicitement (M9 : plus d éviction silencieuse)', refused === 2)
  const keys = (await q4.list()).map((m) => m.idempotency_key).join(',')
  assert('les plus anciennes sont conservées', keys === 'k0,k1,k2')

  console.log(`\nRésultat offline : ${passed} réussis, ${failed} échec(s).`)
  if (failed > 0) process.exit(1)
}

void run()
