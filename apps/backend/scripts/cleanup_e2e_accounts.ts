// ============================================================================
// Nettoyage des comptes de recette E2E (P7b).
//
// Usage :
//   tsx scripts/cleanup_e2e_accounts.ts            # supprime les 7 comptes + les 2 tenants + leurs fichiers de preuve
//   tsx scripts/cleanup_e2e_accounts.ts --dry-run  # simulation seulement
//   tsx scripts/cleanup_e2e_accounts.ts --no-tenant # garde le tenant
//
// Idempotent : sans comptes, on sort proprement.
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('ERREUR : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const TENANT_NAMES = [
  process.env.E2E_TENANT_NAME ?? 'Qualidji — Recette E2E',
  process.env.E2E_TENANT_B_NAME ?? 'Qualidji — Recette E2E B',
]

const ACCOUNTS = [
  'rbac.test@qualidji.fr',
  'operator.test@qualidji.fr',
  'ta.test@qualidji.fr',
  'e2e.member@qualidji.fr',
  'auditor.test@qualidji.fr',
  'b.qm.test@qualidji.fr',
  'b.ta.test@qualidji.fr',
] as const

type Flags = { dryRun: boolean; noTenant: boolean }

function parseArgs(argv: string[]): Flags {
  const flags = { dryRun: false, noTenant: false }
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--dry-run':
        flags.dryRun = true
        break
      case '--no-tenant':
        flags.noTenant = true
        break
      default:
        console.error(`Option inconnue : ${argv[i]}`)
        process.exit(1)
    }
  }
  return flags
}

/** Supprime récursivement les fichiers de preuve d'un tenant dans le bucket (les lignes partent en cascade, pas les fichiers). */
async function purgeEvidenceFiles(tenantId: string): Promise<number> {
  const bucket = admin.storage.from('evidence')
  let removed = 0
  async function walk(prefix: string): Promise<void> {
    const { data, error } = await bucket.list(prefix, { limit: 1000 })
    if (error || !data) return
    const files: string[] = []
    for (const entry of data) {
      // Les « dossiers » n'ont pas d'identifiant d'objet
      if (entry.id === null) await walk(`${prefix}/${entry.name}`)
      else files.push(`${prefix}/${entry.name}`)
    }
    if (files.length) {
      const { error: rmErr } = await bucket.remove(files)
      if (!rmErr) removed += files.length
    }
  }
  await walk(tenantId)
  return removed
}

async function main() {
  const flags = parseArgs(process.argv.slice(2))
  console.log(`== Nettoyage des comptes E2E (recette) ${flags.dryRun ? '[DRY-RUN]' : ''} ==`)

  // 1. Tenants D'ABORD : la suppression emporte en cascade profils, actions, preuves, workflows
  //    du tenant. Supprimer les utilisateurs avant échouait (clés étrangères vers auth.users).
  if (!flags.noTenant) {
    for (const name of TENANT_NAMES) {
      const { data: tenant, error: te } = await admin.from('tenants').select('id').eq('name', name).maybeSingle()
      if (te) {
        console.error(`  ✗ listing tenants : ${te.message}`)
        process.exit(1)
      }
      if (!tenant?.id) {
        console.log(`  ○ tenant absent : ${name}`)
        continue
      }
      if (flags.dryRun) {
        console.log(`  ○ (dry-run) suppression du tenant et de ses fichiers : ${name}`)
        continue
      }
      const files = await purgeEvidenceFiles(tenant.id)
      const { error: delErr } = await admin.from('tenants').delete().eq('id', tenant.id)
      if (delErr) {
        console.error(`  ✗ suppression du tenant ${name} : ${delErr.message}`)
        process.exit(1)
      }
      console.log(`  ✓ tenant supprimé : ${name} (${files} fichier(s) de preuve retiré(s))`)
    }
  }

  // 2. Comptes GoTrue — les 7 comptes de recette + les comptes d'invitation créés par le test §3.4
  //    (e2e_test_<horodatage>@qualidji.fr), qui n'ont pas de nom fixe.
  const { data: all, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listErr) {
    console.error(`  ✗ listing users : ${listErr.message}`)
    process.exit(1)
  }
  const invited = all.users.map((u) => u.email ?? '').filter((e) => /^e2e_test_\d+@qualidji\.fr$/.test(e))
  for (const email of [...ACCOUNTS, ...invited]) {
    const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error) {
      console.error(`  ✗ listing users : ${error.message}`)
      process.exit(1)
    }
    const user = list.users.find((u) => u.email === email)
    if (!user) {
      console.log(`  ○ compte absent : ${email}`)
      continue
    }
    if (flags.dryRun) {
      console.log(`  ○ (dry-run) suppression de l'utilisateur : ${email}`)
      continue
    }
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
    if (delErr) {
      console.error(`  ✗ suppression de ${email} : ${delErr.message}`)
      process.exit(1)
    }
    console.log(`  ✓ utilisateur supprimé : ${email}`)
  }

  console.log('Nettoyage terminé.')
}

void main()
