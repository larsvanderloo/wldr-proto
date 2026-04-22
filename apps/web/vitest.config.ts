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
    // Server-side utilities en handlers: node-omgeving (geen browser/happy-dom nodig)
    // Frontend unit-tests: ook node (geen Nuxt-context vereist voor pure logic)
    environmentMatchGlobs: [
      ['tests/unit/**', 'node'],
      ['server/**/__tests__/**', 'node'],
    ],
  },
})
