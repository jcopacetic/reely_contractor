import { defineConfig } from 'vitest/config'

// DB-backed e2e seams — run against the local Postgres (pnpm infra:up). Sequential + isolated: each run
// namespaces its rows by a RUN prefix and tears them down, so the suite is safe in a shared dev DB.
export default defineConfig({
  test: {
    include: ['src/**/*.e2e.test.ts'],
    environment: 'node',
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
