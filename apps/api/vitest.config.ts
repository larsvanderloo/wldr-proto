import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Unit-tests: sluit integration-tests uit.
    // Integration-tests draaien via: vitest run 'src/**/*.integration.test.ts'
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.integration.test.ts',
    ],
    environment: 'node',
  },
})
