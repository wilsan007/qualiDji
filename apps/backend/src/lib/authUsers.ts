import { supabaseAdmin } from './supabase'

/**
 * M5 — GoTrue pagine `auth.admin.listUsers()` (50 par page par défaut) : sans boucle,
 * les e-mails au-delà de la 1re page manquaient. On parcourt toutes les pages
 * (bornées : 200 pages de 1000 = 200 000 comptes).
 */
export async function listAllAuthUsers(): Promise<{ id: string; email?: string; last_sign_in_at?: string | null }[]> {
  const perPage = 1000
  const out: { id: string; email?: string; last_sign_in_at?: string | null }[] = []
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.error('[auth] listUsers page', page, error.message)
      break
    }
    const users = data?.users ?? []
    for (const u of users) out.push({ id: u.id, email: u.email ?? undefined, last_sign_in_at: u.last_sign_in_at ?? null })
    if (users.length < perPage) break
  }
  return out
}

/** Table id → e-mail pour tous les comptes. */
export async function emailMap(): Promise<Map<string, string>> {
  const users = await listAllAuthUsers()
  return new Map(users.filter((u) => u.email).map((u) => [u.id, u.email as string]))
}
