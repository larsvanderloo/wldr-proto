// eslint.config.js — repo-root flat config (ESLint 9)
//
// Gelaagde opbouw:
//   1. Basisregels voor alle TS/JS bestanden (gedeeld door api, contracts, db, web)
//   2. Node/Fastify-specifieke overrides voor apps/api/**
//   3. Config- en script-bestanden krijgen geen type-aware regels (vallen buiten tsconfigs)
//   4. Vue-bestanden worden bewust NIET geconfigureerd hier — dat is aan apps/web/eslint.config.js
//      (zie sectie "Sub-configs stapelen" onderaan dit bestand).
//
// Sub-configs stapelen
// --------------------
// apps/web/eslint.config.js kan de root config importeren en uitbreiden:
//
//   import rootConfig from '../../eslint.config.js'
//   import pluginVue from 'eslint-plugin-vue'
//   import vueParser from 'vue-eslint-parser'
//   import tseslint from 'typescript-eslint'
//
//   export default tseslint.config(
//     ...rootConfig,
//     // Vue-specifieke regels boven op de root:
//     ...pluginVue.configs['flat/recommended'],
//     {
//       files: ['**/*.vue'],
//       languageOptions: {
//         parser: vueParser,
//         parserOptions: {
//           parser: tseslint.parser,
//           extraFileExtensions: ['.vue'],
//           projectService: true,
//           tsconfigRootDir: import.meta.dirname,
//         },
//       },
//       rules: {
//         // Nuxt auto-imports maken component-gebruik zonder import syntactisch correct.
//         // Voeg hier Nuxt-specifieke regeluitzonderingen toe.
//       },
//     },
//   )
//
// ESLint 9 pikt apps/web/eslint.config.js automatisch op als het dichterbij het project ligt.
// De root config hoeft niet aangepast te worden wanneer de frontend-agent zijn config levert.

import tseslint from 'typescript-eslint'

// Patroon voor bestanden die buiten een workspace-tsconfig vallen.
// Dit zijn config-bestanden (playwright, vitest, nuxt.config, etc.) en scripts.
// Ze krijgen geen type-aware regels omdat projectService ze niet kent.
const CONFIG_AND_SCRIPTS = [
  // Root-level configs
  'eslint.config.js',
  'commitlint.config.mjs',
  // Workspace config-bestanden (niet app-code)
  'apps/web/playwright.config.ts',
  'apps/web/vitest.config.ts',
  'apps/web/nuxt.config.ts',
  'apps/web/colada.options.ts',
  // E2E-tests vallen buiten de Nuxt tsconfig
  'apps/web/tests/e2e/*.spec.ts',
  'apps/web/tests/e2e/*.test.ts',
  // Scripts
  'scripts/*.sh',
]

export default tseslint.config(
  // --- Bestanden die volledig worden genegeerd ---
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/coverage/**',
      '**/*.min.js',
      // Gegenereerde Prisma-client — nooit linten
      'packages/db/prisma/generated/**',
      // Playwright-rapport-output
      'test-results/**',
      'playwright-report/**',
    ],
  },

  // --- Basis: alle TypeScript- en JavaScript-bestanden MET type-awareness ---
  // Type-aware regels vereisen dat het bestand in een tsconfig staat.
  // Config-bestanden en scripts (zie CONFIG_AND_SCRIPTS) zijn uitgesloten.
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    ignores: CONFIG_AND_SCRIPTS,
    extends: [
      tseslint.configs.recommended,
    ],
    rules: {
      // TypeScript strict-friendly — geen any stilzwijgend toestaan
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Floating promises zijn in een async HR SaaS altijd een bug
      '@typescript-eslint/no-floating-promises': 'error',
      // Forceer expliciete returns in functies met retourtype — te noisy in Nuxt composables;
      // de frontend-agent kan dit aanzetten in apps/web/eslint.config.js
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Geef de voorkeur aan `import type` voor type-only imports
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      // Geen non-null assertion tenzij bewust
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Standaard JS-kwaliteit
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // --- Config- en script-bestanden: geen type-aware regels ---
  // Deze bestanden vallen buiten workspace-tsconfigs; projectService kent ze niet.
  // Ze worden gecheckt met basis TS-rules (geen floating-promises check e.d.).
  {
    files: CONFIG_AND_SCRIPTS,
    extends: [
      tseslint.configs.recommended,
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      'no-console': 'off',
      'prefer-const': 'error',
    },
    // Geen languageOptions.parserOptions.projectService hier — dat triggert de parse-fouten
  },

  // --- Node/Fastify backend (apps/api + packages/db) ---
  {
    files: ['apps/api/**/*.ts', 'packages/db/**/*.ts', 'packages/contracts/**/*.ts'],
    rules: {
      // In de API mag console.error/info gebruikt worden voor bootstrap-fouten
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // no-floating-promises is hier kritisch: onafgehandelde promise = silent fail in Fastify
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
)
