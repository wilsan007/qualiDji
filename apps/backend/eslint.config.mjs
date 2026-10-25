// ESLint 9 (flat config) — backend Express/TS.
// Règles « recommended » seules + assouplissements assumés :
//  - no-explicit-any off : le code historique assume `any` (les gardes Zod et le
//    typage strict de tsc font le travail de fond) ;
//  - unused-vars : paramètres/variables préfixés `_` tolérés (gestionnaires d'erreurs).
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
)
