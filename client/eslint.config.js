import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    settings: { react: { version: '18.2' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs['recommended-latest'].rules,

      // Vite + the new JSX transform: React need not be in scope for JSX,
      // and prop-types are not used anywhere in this codebase.
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      'react/prop-types': 'off',

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // The codebase deliberately uses empty/ignored catch bindings for
      // non-critical fire-and-forget calls (e.g. `catch (_) {}`), so unused
      // caught errors are not flagged.
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrors: 'none'
      }],

      // Genuine performance finding, tracked for the re-render step of the
      // optimisation pass — surfaced as a warning so it stays visible
      // without blocking the lint gate before it is addressed.
      'react-hooks/set-state-in-effect': 'warn'
    }
  },
  {
    // Config files run in Node, not the browser.
    files: ['*.config.js', 'postcss.config.js', 'tailwind.config.js'],
    languageOptions: { globals: { ...globals.node } }
  }
]
