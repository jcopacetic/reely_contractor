# @contractor/api

Fastify + tRPC — the Contractor node's writer. USER-scoped (no tenant). Hosts the 9 modules plus the
service-key **provider** surface that Board consumes. Per-module as-built notes live in `../../docs/{module}.md`.

## Modules
| Module | Router prefix | What it owns |
| --- | --- | --- |
| contractor-identity | `identity.*` | vetting state machine (applicant → vetted → suspended) + invites |
| profile | `profile.*` | linktree profile + onboarding; the anonymous public safe-subset |
| feed | `feed.*` | club feed: posts, reactions, threaded comments |
| graph | `graph.*` | follows + the authenticated in-club profile view |
| dm | `dm.*` | 1:1 social DMs (participant-gated) |
| marketplace | `marketplace.*` (+ `.provider.*`) | listings + bids; the Board provider surface |
| job-feed | `jobFeed.*` | read-only vetted browse over open listings |
| contracts | `contracts.*` (+ `.provider.*`) | the living hire container + items |
| time | `time.*` (+ `.provider.*`) | time entries; contractor writes, client approves |

`health` is the one `publicProcedure`. The full router is `src/trpc/router.ts`.

## Auth / vetting / scoping model (`src/trpc/trpc.ts`)
The trusted **web server** (never the browser) presents a service key (`x-contractor-service-key`) plus the
verified acting Clerk user (`x-acting-user`) + role (`x-acting-role`). Procedures:
- **`publicProcedure`** — anonymous (health, public profile reads).
- **`sessionProcedure`** — service key + an acting user (any signed-in applicant or contractor).
- **`adminProcedure`** — `sessionProcedure` + role `platform_admin` (vetting queue, admin actions).
- **`vettedProcedure`** — the **hard gate**: re-checks the DB-authoritative `contractor_identity.status ===
  'vetted'` (not just the mirrored header role). Every privileged contractor write goes through it.
- **`serviceProcedure`** — service key only, no acting user (the Board provider intake), always paired with a
  resource scope (`boardPartRef` / `boardRef`) in the store — never an unscoped collection.

On vetting approval the role is mirrored to Clerk `publicMetadata` so the marketing nav + `/contractor/*`
middleware gate cheaply; the DB status stays authoritative.

## RLS vs app-guards (honest note)
An RLS layer is defined in `packages/db/prisma/rls.sql` (+ the `withUser` GUC helper in `@contractor/db`), but
the module stores query the **bare `prisma` client directly** (not wrapped in `withUser`), so RLS is **defined
but not actively enforced per-request**. The **app-layer participant / owner / role / user-scope guards in the
stores are the real, verified boundary** (covered by the e2e suite). RLS is a backstop to be wired via
`withUser` later — do not treat it as the active enforcement.

## Dev / test
```bash
pnpm --filter @contractor/api dev        # tsx watch (:3101)
pnpm --filter @contractor/api test       # vitest (unit — trpc auth-mapping, 9/9)
pnpm --filter @contractor/api test:e2e   # DB-backed security invariants (14/14; needs local Postgres)
pnpm --filter @contractor/api typecheck
```
CORS allows origin-less service-to-service callers; browsers are restricted to the Reely origins
(`ALLOWED_ORIGINS`).
