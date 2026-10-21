// ============================================================================
// Provisionnement des comptes E2E (P7b) — CI sur pile Supabase fraîche
//
// Crée : 1 tenant de recette + 4 comptes GoTrue (email confirmé, mot de passe
// connu) + les profils user_profiles rattachés au tenant avec le rôle V5.
//
// Usage local :  tsx scripts/provision_e2e.ts
// Usage CI    :  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... tsx scripts/provision_e2e.ts
//
// Idempotent : rejouable sans erreur (les comptes existants sont mis à jour).
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

type Role = 'quality_manager' | 'operator' | 'tenant_admin' | 'reader'

const ACCOUNTS: Array<{ email: string; role: Role; display_name: string }> = [
  { email: 'rbac.test@qualidji.fr', role: 'quality_manager', display_name: 'Recette QM' },
  { email: 'operator.test@qualidji.fr', role: 'operator', display_name: 'Recette Opérateur' },
  { email: 'ta.test@qualidji.fr', role: 'tenant_admin', display_name: 'Recette Tenant Admin' },
  { email: 'e2e.member@qualidji.fr', role: 'reader', display_name: 'Recette Membre' },
]

let failures = 0

function fail(msg: string) {
  failures++
  console.error(`  ✗ ${msg}`)
}

async function ensureTenant(): Promise<string> {
  const { data: existing, error } = await admin
    .from('tenants')
    .select('id')
    .eq('name', TENANT_NAME)
    .maybeSingle()
  if (error) throw error
  if (existing?.id) {
    console.log(`  ✓ tenant déjà présent : ${existing.id}`)
    return existing.id
  }
  const { data, error: insErr } = await admin
    .from('tenants')
    .insert({ name: TENANT_NAME })
    .select('id')
    .single()
  if (insErr) throw insErr
  console.log(`  ✓ tenant créé : ${data.id}`)
  return data.id
}

async function ensureUser(email: string, password: string) {
  const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  const found = list.users.find((u) => u.email === email)

  if (found) {
    // Compte déjà présent : on (re)définit le mot de passe et on confirme l'e-mail.
    const { error: updErr } = await admin.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
    })
    if (updErr) throw updErr
    console.log(`  ✓ compte présent, mot de passe réinitialisé : ${email}`)
    return found.id
  }

  const { data, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr) throw createErr
  console.log(`  ✓ compte créé : ${email}`)
  return data.user!.id
}

async function ensureProfile(userId: string, tenantId: string, role: Role, displayName: string) {
  const { data: existing, error } = await admin
    .from('user_profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error

  if (existing?.id) {
    const { error: updErr } = await admin
      .from('user_profiles')
      .update({ tenant_id: tenantId, role, display_name: displayName, is_active: true })
      .eq('id', userId)
    if (updErr) throw updErr
    return
  }

  const { error: insErr } = await admin.from('user_profiles').insert({
    id: userId,
    tenant_id: tenantId,
    role,
    display_name: displayName,
  })
  if (insErr) throw insErr
}

async function main() {
  console.log('== Provisionnement des comptes E2E (P7b) ==')
  console.log(`URL : ${url}`)

  let tenantId: string
  try {
    tenantId = await ensureTenant()
  } catch (e) {
    console.error('  ✗ création du tenant impossible :', (e as Error).message)
    process.exit(1)
  }

  for (const account of ACCOUNTS) {
    try {
      const uid = await ensureUser(account.email, PASSWORD)
      await ensureProfile(uid, tenantId, account.role, account.display_name)
      console.log(`  ✓ profil ${account.role} rattaché : ${account.email}`)
    } catch (e) {
      fail(`${account.email} : ${(e as Error).message}`)
    }
  }

  if (failures > 0) {
    console.error(`\nÉCHEC : ${failures} compte(s) non provisionné(s).`)
    process.exit(1)
  }
  console.log('\nProvisionnement terminé.')
}

void main()
