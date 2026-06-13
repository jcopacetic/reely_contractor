# Reely Contractor

The **Contractor** node — a **vetted-only contractor club + work marketplace**. Contractors apply → an admin
approves (vetting gate) → they onboard (a linktree-style public profile, skill categories, signed docs) → they
get a **social club** (feed, follows, reactions/comments, achievements/XP, DMs) and a **work loop** (job-feed →
bids → contracts → time). The work loop plugs into **Board** via the `contractor.*` provider contracts Board
already consumes (its `hiring-bridge` + deferred client).

**USER-SCOPED (no tenant).** A `contractor_identity` is a verified layer on the base Clerk User — there is no
local user table and no Clerk-Org tenancy. Access is **user-scoped + participant-scoped**. The hard gate is
`contractor_identity.status` (applicant → vetted → suspended); every privileged write goes through
`vettedProcedure` (DB-authoritative). Clients appear only as opaque Clerk User ids on two-party entities — they
never get a contractor profile.

> Built **social-club-first** — a recorded deviation from the manifest's work-loop-first v1 (see `CLAUDE.md`).

## Layout (turborepo + pnpm)
```
apps/
  api      @contractor/api      Fastify + tRPC — the 9 modules + the Board provider surface
  web      @contractor/web      Next.js 15 — the /contractor app + public /pro profiles
  worker   @contractor/worker   BullMQ — achievements/XP off the event stream
packages/
  db       @contractor/db       Prisma client + schema, Migrate workflow, RLS + withUser GUC helper
  ui       @contractor/ui       Tailwind + Lucide shared components
```
Modules (`apps/api/src/modules/*`, see `docs/{module}.md`): `contractor-identity` · `profile` · `feed` ·
`graph` · `dm` · `marketplace` · `job-feed` · `contracts` · `time`.

## Dev
```bash
pnpm install
pnpm infra:up        # docker Postgres (contractor :5436) + Redis (:6383)
pnpm db:generate     # prisma generate
pnpm db:migrate      # prisma migrate dev (writes + applies migrations)
pnpm db:rls          # apply packages/db/prisma/rls.sql
pnpm db:seed         # skill categories, achievements, a dev session
pnpm dev             # turbo run dev (api :3101 + web :3100 + worker)

pnpm test                               # turbo run test (unit — trpc auth-mapping)
pnpm --filter @contractor/api test:e2e  # DB-backed security invariants (needs local Postgres)
pnpm typecheck
```
Clerk unset locally → a dev session powers the loop; Resend / R2 / Stripe / Supabase clients no-op or stub when
their keys are unset.

## Migrations (Prisma Migrate-managed — NOT `db push`)
Schema changes are committed versioned migrations under `packages/db/prisma/migrations/`. `0_init` is the
baseline (the original schema) and is **not** re-applied to the existing prod DB; only post-baseline migrations
are (currently `1_add_contractor_name_company_position`). Apply a migration to prod by running its one
`migration.sql` via the Supabase MCP (project `mgjhsihzhltemvkssbbg`).

Authoritative spec is `spec/`; per-module as-built notes are in `docs/`. **Manifest wins over code.** See `CLAUDE.md`.
