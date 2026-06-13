import { defineConfig } from 'vitest/config'

// Unit + pure-logic tests. The DB-backed e2e suite runs under vitest.e2e.config.ts, so exclude it here —
// `pnpm test` must stay DB-free (no local Postgres/Redis required).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.e2e.test.ts', '**/node_modules/**'],
    environment: 'node',
  },
})
