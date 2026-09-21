import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'public']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Allow `const { toOmit, ...rest } = obj` where `toOmit` is deliberately
      // unused — e.g. stripping non-serializable fields before persisting.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  {
    // Node-context file: the Vite config itself, as opposed to everything in
    // src/ which runs in the browser.
    files: ['vite.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
])
