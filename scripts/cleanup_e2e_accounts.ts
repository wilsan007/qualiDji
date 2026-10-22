// ============================================================================
// Nettoyage des comptes de recette E2E (P7b).
//
// Usage :
//   tsx scripts/cleanup_e2e_accounts.ts            # supprime les 4 comptes + tenant
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

const PASSWORD = process.env.E2E_PASSWORD ?? 'Qualidji!RBAC2026'
const TENANT_NAME = process.env.E2E_TENANT_NAME ?? 'Qualidji — Recette E2E'

const ACCOUNTS = [
  'rbac.test@qualidji.fr',
  'operator.test@qualidji.fr',
  'ta.test@qualidji.fr',
  'e2e.member@qualidji.fr',
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

async function main() {
  const flags = parseArgs(process.argv.slice(2))
  console.log(`== Nettoyage des comptes E2E (recette) ${flags.dryRun ? '[DRY-RUN]' : ''} ==`)

  // 1. Supprimer les 4 comptes GoTrue (cascade sur user_profiles via auth.users FK)
  for (const email of ACCOUNTS) {
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

  // 2. Supprimer le tenant (optionnel)
  if (!flags.noTenant) {
    const { data: tenants, error: te } = await admin.from('tenants').select('id').eq('name', TENANT_NAME).maybeSingle()
    if (te) {
      console.error(`  ✗ listing tenants : ${te.message}`)
      process.exit(1)
    }
    if (!tenants?.id) {
      console.log(`  ○ tenant absent : ${TENANT_NAME}`)
    } else if (flags.dryRun) {
      console.log(`  ○ (dry-run) suppression du tenant : ${TENANT_NAME}`)
    } else {
      const { error: delErr } = await admin.from('tenants').delete().eq('id', tenants.id)
      if (delErr) {
        console.error(`  ✗ suppression du tenant : ${delErr.message}`)
        process.exit(1)
      }
      console.log(`  ✓ tenant supprimé : ${TENANT_NAME}`)
    }
  }

  console.log('Nettoyage terminé.')
}

void main()
