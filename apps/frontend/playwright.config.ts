import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke test frontend (P7b) — parcours minimal sur la pile CI :
 *   login opérateur → tableau de bord → gating RBAC de la navigation.
 *
 * Variables d'environnement (fournies par le job CI `e2e`) :
 *   E2E_BASE_URL    URL du frontend servi (défaut http://localhost:5174)
 *   E2E_EMAIL / E2E_PASSWORD  compte de test provisionné
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Le frontend de la CI est servi par `vite preview` sur le port 5174
  // (le build doit avoir été fait au préalable).
  webServer: {
    command: './node_modules/.bin/vite preview --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
