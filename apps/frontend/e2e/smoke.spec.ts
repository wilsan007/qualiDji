import { test, expect } from '@playwright/test'

/**
 * Smoke test frontend (P7b).
 *
 * Vérifie le parcours le plus critique de l'IHM sur une pile fraîche :
 *  1. l'écran de connexion s'affiche ;
 *  2. la connexion avec un compte opérateur provisionné fonctionne ;
 *  3. le tableau de bord se charge (données servies par le backend) ;
 *  4. la navigation est filtrée par les permissions RBAC (§3.3) — l'opérateur
 *     ne doit voir ni « Utilisateurs » (user.manage) ni « Rapports ».
 *
 * Prérequis : le frontend doit pointer sur la même Supabase que le backend
 * (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY au build) et le compte doit
 * exister — cf. apps/backend/scripts/provision_e2e.ts.
 */

const EMAIL = process.env.E2E_EMAIL ?? 'operator.test@qualidji.fr'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Qualidji!RBAC2026'

test.describe('Parcours minimal (P7b)', () => {
  test('l’écran de connexion s’affiche', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'QualiDji' })).toBeVisible()
    await expect(page.getByLabel('Email professionnel')).toBeVisible()
    await expect(page.getByLabel('Mot de passe')).toBeVisible()
  })

  test('connexion opérateur puis tableau de bord', async ({ page }) => {
    // Toute requête API en échec (CORS, réseau, 5xx) fait échouer le test :
    // on ne veut pas un smoke test qui passe sur une page vide.
    const failures: string[] = []
    page.on('requestfailed', (r) => failures.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`))
    page.on('response', (r) => {
      if (r.url().includes('/api/v1') && r.status() >= 400) {
        failures.push(`${r.status()} ${r.url()}`)
      }
    })

    await page.goto('/login')
    await page.getByLabel('Email professionnel').fill(EMAIL)
    await page.getByLabel('Mot de passe').fill(PASSWORD)
    await page.getByRole('button', { name: 'Se connecter' }).click()

    // Redirection vers le tableau de bord après restauration de session.
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 })
    // Le titre est présent deux fois (bandeau + contenu) : on cible le contenu.
    await expect(page.getByRole('main').getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()

    // Le greeting porte l'identité de l'utilisateur connecté.
    await expect(page.getByText(EMAIL)).toBeVisible()

    // Le tableau de bord charge réellement ses données via l'API
    // (GET /actions/assigned) : aucun état d'erreur ne doit être affiché.
    await expect(page.getByRole('main').getByText('Failed to fetch')).toHaveCount(0)
    await expect(page.getByRole('main').getByText('Réessayer')).toHaveCount(0)
    await expect(page.getByRole('main').getByText('ACTIONS TOTALES')).toBeVisible()

    expect(failures, `appels API en échec :\n${failures.join('\n')}`).toEqual([])
  })

  test('la navigation est filtrée par les permissions RBAC', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email professionnel').fill(EMAIL)
    await page.getByLabel('Mot de passe').fill(PASSWORD)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 })

    // Entrées visibles pour un opérateur (sidebar de navigation).
    const nav = page.getByRole('navigation')
    await expect(nav.getByRole('link', { name: 'Mes actions', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Non-conformités' })).toBeVisible()

    // Entrées réservées (user.manage / action.approve) : absentes.
    await expect(nav.getByRole('link', { name: 'Utilisateurs' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Rapports' })).toHaveCount(0)
  })
})
