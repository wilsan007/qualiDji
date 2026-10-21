import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * Tests unitaires / composants du frontend (P7b).
 * - jsdom + @testing-library/react
 * - alias '@' aligné sur vite.config.ts
 * - variables d'env factices : lib/supabase.ts échoue au chargement sans
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (fail-fast volontaire).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    css: false,
    restoreMocks: true,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      VITE_API_URL: 'http://localhost:4000/api/v1',
    },
  },
})
