import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // A const read before its declaration in the same scope throws at render (a TDZ error the unit tests do not reach and
      // only the browser showed, 2026-10-08). `variables: false` leaves alone a reference from inside a nested function
      // (a handler that uses a const declared further down), which is fine, and flags only the same-scope read that is not.
      'no-use-before-define': ['error', { functions: false, classes: false, variables: false }],
    },
  },
])
