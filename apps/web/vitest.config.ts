import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    // E2E-specs vallen onder Playwright, niet Vitest
    exclude: [
      'tests/e2e/**',
      '**/node_modules/**',
    ],
    // Niet falen bij nog lege testsuites tijdens scaffold-fase
    passWithNoTests: true,
    // Unit-tests die geen Nuxt-context nodig hebben: node-omgeving
    environmentMatchGlobs: [
      ['tests/unit/**', 'node'],
    ],
  },
})
