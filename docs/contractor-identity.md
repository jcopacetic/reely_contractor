# contractor-identity — as-built

*Foundation module. The vetting state machine + invite system. Every privileged write elsewhere in the
node depends on the status this module owns: `vettedProcedure` reads `contractor_identity.status` to gate.*

## What it does
Owns the applicant → vetted → suspended lifecycle on top of the base Clerk User. A `contractor_identity`
is a verified layer on a Clerk user — there is no local user table. Procedures (`router.ts`):
- **`submit`** (sessionProcedure) — a signed-in user applies; `ensureIdentity` upserts the identity
  (new users land as `applicant`) and a fresh `application` row is created. (`apply` is a tRPC-reserved
  name, so the procedure is `submit`.)
- **`redeemInvite`** (sessionProcedure) — redeem an invite code → invite marked `accepted`, an
  invite-sourced application is recorded. Rejects invalid / already-used / >30-day-expired codes.
- **`getStatus`** (sessionProcedure) — the applicant's current identity status + latest application.
- **`createInvite` / `review` / `approve` / `reject` / `suspend` / `reinstate` / `vettingQueue`**
  (adminProcedure) — the admin vetting surface. `approve`/`reinstate` set status `vetted`; `suspend`
  sets `suspended`; each mirrors the role to Clerk via `setContractorFlag` (true on approve/reinstate,
  false on reject/suspend). The queue is bounded (`take 100`, keyset on `createdAt`).

All admin transitions append an `app_event` (`application.submitted`, `contractor.approved/rejected/
suspended`) for the notifications + queue surfaces.

## Files
- `apps/api/src/modules/contractor-identity/router.ts` — tRPC surface (session vs admin split).
- `apps/api/src/modules/contractor-identity/store.ts` — the state machine, invites, `app_event` records.
- `packages/db/src/index.ts` — `ensureIdentity` (idempotent identity upsert).
- `apps/api/src/clerk.ts` — `setContractorFlag` (mirrors `publicMetadata` role on approve/suspend).

## Security/scoping
The vetting gate is the hard gate of the whole node. `submit`/`redeemInvite`/`getStatus` are
`sessionProcedure` (service key + an acting Clerk user). All decision procedures are `adminProcedure`
(role `platform_admin`). The DB `contractor_identity.status` stays authoritative for privileged writes —
the mirrored Clerk flag is only a cheap gate for the nav + middleware; `vettedProcedure` re-checks the DB.
RLS policy bodies exist for `contractor_identity`/`application` (self-read + admin catch-all) in
`packages/db/prisma/rls.sql`, but the store uses the bare `prisma` client (not `withUser`), so the
adminProcedure gate is the real, verified boundary; RLS is a defined backstop to be wired via `withUser`.

## Verified
`pnpm typecheck` 5/5 packages · `pnpm test` (unit) 9/9 (trpc auth-mapping) · `pnpm --filter @contractor/api
test:e2e` 14/14 (security invariants, incl. the vetting gate). Migrations are Prisma Migrate-managed
(`0_init` baseline + `1_add_contractor_name_company_position`), applied to prod via the Supabase MCP.

## Out of scope
E-sign of legal docs (onboarding doc acceptance lives in profile; v1 is acknowledgement-only) · Clerk
user creation (the User pre-exists) · notifications dispatch (consumes the emitted `app_event`s, later).
