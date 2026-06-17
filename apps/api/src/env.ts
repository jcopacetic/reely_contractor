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
  // Notification digest email: the from/reply addresses + a stable secret for one-click unsubscribe HMAC tokens.
  NOTIFICATIONS_FROM: z.string().default('Reely <no_reply@reely.io>'),
  NOTIFICATIONS_REPLY_TO: z.string().optional(),
  NOTIFICATIONS_UNSUB_SECRET: z.string().optional(),
  // Where billing disputes (and other ops alerts) email the owner. Defaults to the Khaotic ops inbox.
  OPS_EMAIL: z.string().default('jonathan@khaoticdigital.com'),
  // Timer integrity: manual time entry is BLOCKED at launch (the timer is required; no fudged/duped time).
  // Flip to true to allow contractors to add time by hand. The browser-extension tracker is always allowed.
  ALLOW_MANUAL_TIME: z.coerce.boolean().default(false),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  // Stripe Connect Express (payments). All optional → the client stubs (no-ops/synthetic ids) when unset, so
  // the billing cycle runs end-to-end locally + in prod without real money. PLATFORM_TAKE_RATE_PCT defaults to 0.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CONNECT_CLIENT_ID: z.string().optional(),
  PLATFORM_TAKE_RATE_PCT: z.coerce.number().min(0).max(100).default(0),
  APP_BASE_URL: z.string().default('https://reely.io'), // for Connect onboarding return/refresh URLs
})

export const env = EnvSchema.parse(process.env)
export type Env = z.infer<typeof EnvSchema>
