import { z } from 'zod'

/**
 * Env schema (contractor.manifest.json env). Local-first: secrets are optional so the skeleton boots
 * without real infra; provider clients no-op/stub when their key is unset. USER-scoped node — Clerk
 * authenticates the User; vetting status lives in the DB (mirrored to a Clerk role on approval).
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(3101),
  ALLOWED_ORIGINS: z.string().optional(),

  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5436/contractor'),
  DIRECT_URL: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6383'),

  // Clerk: secret key powers the role mirror (publicMetadata.role='contractor' on approve). Unset → mirror no-ops.
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),

  // Shared service secret the trusted web server (and Board provider calls, Phase 2) present as
  // x-contractor-service-key. Unset locally → no caller admitted as a service caller (closed by default).
  CONTRACTOR_SERVICE_KEY: z.string().optional(),

  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
})

export const env = EnvSchema.parse(process.env)
export type Env = z.infer<typeof EnvSchema>
