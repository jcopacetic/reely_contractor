# time — as-built

*Work tracked against a contract (`time_entry`). The contractor is the only writer (timer / extension /
manual); the contract's client reads + approves; **only approved time bills**. Participant-scoped.*

## What it does
Owns `time_entry` (and ONLY this). **Native** procedures (`router.ts`, all vetted):
- **`start` / `stop` / `cancelRunning`** — the running timer (contractor-only). One running entry per
  contractor at a time; the contract must be `active`. `stop` clamps duration to `MAX_RUNNING_HOURS` = 12
  (a forgotten timer can't over-bill); `cancelRunning` discards a mistaken start. `start` emits
  `time_entry.created`.
- **`manualEntry`** — a completed entry by hand or from the extension; both ends required; rejects
  `MIN_ENTRY_SECONDS` (60) too-short and >12h too-long entries; emits `time_entry.created`.
- **`getRunning`** — the contractor's currently-running entry across all their contracts (drives the timer UI).
- **`listTime`** — a contract's entries + summary (approved/pending/running seconds), participant-scoped.
- **`approve` / `unapprove`** — **client-only**; approving makes an entry billable (idempotent) and clears any
  open dispute; emits `time_entry.approved`. `unapprove` refuses once the entry has been swept into a billing
  cycle (`already_billed`).
- **`dispute` / `withdrawDispute`** — **client-only**; `dispute(entryId, reason)` contests an entry (sets
  `disputed` + `dispute_reason` + `disputed_at`, un-approves it so it can't bill until resolved; emits
  `time_entry.disputed`). Refuses a running or already-billed entry. `withdrawDispute` clears it back to pending.
  Resolution = the client approves (clears it) or withdraws, or the contractor concedes by deleting.
- **`deleteEntry`** — **contractor-only**; deletes own tracked time while un-billed (the owner "removes time I
  logged", and how a contractor concedes a dispute). A billed entry is immutable (`already_billed`).

**Verification:** every entry view carries `verified` = `source !== 'manual'` — timer/extension entries are
activity-backed (verified); **manual entries are unverified** and are the natural dispute target. The summary
splits seconds into `approvedSeconds` (billable) / `disputedSeconds` (contested) / `pendingSeconds`.

**Provider** sub-router (`time.provider.*`, serviceProcedure): `listTime` + `approve` + `dispute` for a
Board-originated contract (Board, as the client, reads/approves/disputes an entry).

## Files
- `apps/api/src/modules/time/router.ts` — native (vetted) + provider (service-key) surfaces.
- `apps/api/src/modules/time/store.ts` — timer/manual writes, the summary, the client-only approval path.

## Security/scoping
`vettedProcedure` + role-within-the-contract gates: **writes are contractor-only** (`contractorUserId` must
match), **approval is client-only** (`clientUserId` must match), reads are participant-only (null otherwise).
The actor is `ctx.clerkUserId`. The **provider surface is `serviceProcedure` + resource-scoped**: both ops
require a non-null `boardRef`, refusing non-Board contracts (`forbidden`). Only `approved = true` entries are
billable (the Phase 2 payment cycle sums those exclusively). RLS exists in `rls.sql` but the store uses the
bare `prisma` client (not `withUser`), so the app-layer participant + role + provider boardRef checks are the
real, verified boundary; RLS is a defined backstop to be wired later.

## Verified
`pnpm typecheck` 5/5 · `pnpm test` (unit) 9/9 · `pnpm --filter @contractor/api test:e2e` 19/19 (incl. the
contractor-writes / client-approves participant invariants + dispute/verify/delete: client disputes, non-client
can't, approve clears dispute, contractor deletes own un-billed time, billed entries refuse both). Prisma
Migrate-managed (`0_init` + `1_add_...` + `2_add_time_dispute`); prod applied via Supabase MCP.

## Out of scope
The weekly billing cycle + Stripe charges (Phase 2 — platform-initiated after the dispute window; the
signature-verified, idempotent webhook never initiates a charge) · the browser-extension codebase itself
(separate; this module just accepts its `source: 'extension'` entries) · hire-loop messaging.
