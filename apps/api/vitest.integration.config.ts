import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Integration-tests: draai ALLEEN de .integration.test.ts bestanden.
    include: ['src/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    testTimeout: 30000, // DB-calls kunnen langzamer zijn
    hookTimeout: 30000,
  },
})
