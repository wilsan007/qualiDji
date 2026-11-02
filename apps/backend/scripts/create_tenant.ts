// ============================================================================
// Création d'une entreprise cliente (tenant) et de ses premiers comptes.
//
// QualiDji n'a pas d'écran d'auto-inscription : une entreprise est ouverte par
// l'opérateur de la plateforme (ou le cabinet qui l'accompagne) avec ce script, qui
//   1. crée le tenant ;
//   2. invite son administrateur (rôle tenant_admin) par e-mail : lien à usage unique
//      vers /set-password, aucun mot de passe en clair ;
//   3. peut inviter d'autres comptes de départ (--also rôle:e-mail[:Nom affiché]).
// L'administrateur invite ensuite le reste de l'équipe depuis l'écran Utilisateurs.
//
// Usage :
//   pnpm --filter @iso/backend tenant:create -- --name "Atelier Djibouti SARL" \
//        --admin-email direction@atelier.example --admin-name "A. Direction" \
//        --also quality_manager:qualite@atelier.example:"B. Qualité" \
//        --also consultant:conseil@cabinet.example
//
// Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ; APP_URL (adresse publique du site,
// ex. https://app.qualidji.fr — doit figurer dans Auth → URL Configuration de Supabase).
// Sécurité : refuse une base distante sauf ALLOW_REMOTE_PROVISIONING=1 (comme provision_extra_roles.ts).
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const ROLES = [
  'tenant_admin', 'quality_manager', 'site_manager', 'department_manager', 'process_owner',
  'operator', 'internal_auditor', 'external_auditor', 'consultant', 'reader',
] as const
type Role = (typeof ROLES)[number]

interface Invitee { role: Role; email: string; name: string | null }

function usage(msg?: string): never {
  if (msg) console.error(`ERREUR : ${msg}\n`)
  console.error('Usage : tenant:create --name "<entreprise>" --admin-email <e-mail> [--admin-name "<nom>"] [--also <rôle>:<e-mail>[:<nom>]]...')
  console.error(`Rôles autorisés pour --also : ${ROLES.join(', ')}`)
  process.exit(1)
}

function parseArgs(argv: string[]) {
  let name = ''
  let adminEmail = ''
  let adminName: string | null = null
  const also: Invitee[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i] ?? usage(`valeur manquante après ${a}`)
    if (a === '--') continue
    else if (a === '--name') name = next().trim()
    else if (a === '--admin-email') adminEmail = next().trim().toLowerCase()
    else if (a === '--admin-name') adminName = next().trim() || null
    else if (a === '--also') {
      const [role, email, ...nameParts] = next().split(':')
      if (!ROLES.includes(role as Role)) usage(`rôle inconnu dans --also : ${role}`)
      if (!email?.includes('@')) usage(`e-mail invalide dans --also : ${email}`)
      also.push({ role: role as Role, email: email.trim().toLowerCase(), name: nameParts.join(':').trim() || null })
    } else usage(`argument inconnu : ${a}`)
  }
  if (name.length < 3) usage('--name requis (3 caractères min.)')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) usage('--admin-email requis (adresse valide)')
  return { name, adminEmail, adminName, also }
}

async function main() {
  const { name, adminEmail, adminName, also } = parseArgs(process.argv.slice(2))

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('ERREUR : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis')
    process.exit(1)
  }
  const host = new URL(url).hostname
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  if (!isLocal && process.env.ALLOW_REMOTE_PROVISIONING !== '1') {
    console.error(`ERREUR : ${host} n'est pas une base locale. Pour ouvrir une entreprise sur une base distante : ALLOW_REMOTE_PROVISIONING=1.`)
    process.exit(1)
  }
  const appUrl = (process.env.APP_URL ?? '').trim().replace(/\/+$/, '')
  const redirectTo = appUrl ? `${appUrl}/set-password` : undefined
  if (!redirectTo) console.warn('AVERTISSEMENT : APP_URL absent — le lien d\'invitation retombera sur la Site URL de Supabase.')

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const invitees: Invitee[] = [{ role: 'tenant_admin', email: adminEmail, name: adminName }, ...also]
  const seen = new Set<string>()
  for (const inv of invitees) {
    if (seen.has(inv.email)) usage(`e-mail en double : ${inv.email}`)
    seen.add(inv.email)
  }

  const { data: existing } = await admin.from('tenants').select('id').eq('name', name).maybeSingle()
  if (existing) {
    console.error(`ERREUR : une entreprise nommée « ${name} » existe déjà (${existing.id}). Choisissez un nom distinct.`)
    process.exit(1)
  }

  const { data: tenant, error: tErr } = await admin.from('tenants').insert({ name }).select('id').single()
  if (tErr || !tenant) {
    console.error(`ERREUR : création du tenant impossible — ${tErr?.message}`)
    process.exit(1)
  }
  console.log(`✓ Entreprise « ${name} » créée (${tenant.id})`)

  let failures = 0
  for (const inv of invitees) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(inv.email, { data: { role: inv.role }, redirectTo })
    if (error || !data.user) {
      failures++
      console.error(`  ✗ ${inv.role} ${inv.email} — invitation impossible : ${error?.message}`)
      continue
    }
    const { error: pErr } = await admin.from('user_profiles').upsert({
      id: data.user.id, tenant_id: tenant.id, role: inv.role, display_name: inv.name,
    })
    if (pErr) {
      failures++
      console.error(`  ✗ ${inv.role} ${inv.email} — profil non créé : ${pErr.message}`)
      continue
    }
    console.log(`  ✓ ${inv.role.padEnd(18)} ${inv.email} — invitation envoyée`)
  }

  if (failures > 0) {
    console.error(`\n${failures} invitation(s) en échec. Le tenant ${tenant.id} existe : relancez l'invitation manquante depuis l'écran Utilisateurs (compte administrateur) une fois l'administrateur connecté.`)
    process.exit(1)
  }
  console.log('\nTerminé. Chaque invité ouvre le lien reçu par e-mail, choisit son mot de passe, puis accède à son espace.')
}

void main()
