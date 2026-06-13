# contracts — as-built

*The hire's living container (`contract`) + its expandable parts (`contract_item`). `contract.id` is the
stable `contract_ref` Board grants against. Participant-scoped (client + the vetted contractor).*

## What it does
Owns `contract` + `contract_item` (and ONLY these — the bid-accept stays in marketplace). **Native**
procedures (`router.ts`, all vetted):
- **`get` / `listMine`** — a contract + items, or the viewer's contracts (either party), participant-scoped.
- **`createFromBid`** — the listing owner turns an accepted bid into a contract; derives parties / title /
  rate from the bid + listing; **idempotent per (listing, contractor)** — a re-hire returns the same contract.
- **`addItem`** — append a `contract_item` (`milestone` | `scope_add` | `deliverable` | `note`), capped at
  `MAX_ITEMS_PER_CONTRACT` = 500; emits `contract.item.added`.
- **`updateStatus`** — drive the status machine: active ↔ paused → completed | cancelled (terminal states
  have no transitions); sets `endedAt` on completed/cancelled; emits `contract.status.changed`.

**Provider** sub-router (`contracts.provider.*`, serviceProcedure): `createContract` (from a bidRef, or
directly from a listingRef when there's no bid) and `getContract`. `createContract` emits `contract.created`
(lets Board mint its grant).

## Files
- `apps/api/src/modules/contracts/router.ts` — native (vetted) + provider (service-key) surfaces.
- `apps/api/src/modules/contracts/store.ts` — creation, the status machine, participant guards, provider ops.

## Security/scoping
Native procedures are `vettedProcedure` with an explicit **participant gate**: reads/writes require the viewer
to be the contract's `clientUserId` or `contractorUserId`, else null (reads) / `forbidden` (writes). The
viewer is `ctx.clerkUserId`. The **provider surface is `serviceProcedure` + resource-scoped**: `providerGetContract`
requires a non-null `boardRef`, refusing non-Board contracts (`forbidden`). `boardRef` is an opaque cross-app
reference, never an FK/JOIN to Board. RLS exists in `rls.sql` but the store uses the bare `prisma` client (not
`withUser`), so the app-layer participant + provider boardRef checks are the real, verified boundary; RLS is a
defined backstop to be wired later.

## Verified
`pnpm typecheck` 5/5 · `pnpm test` (unit) 9/9 · `pnpm --filter @contractor/api test:e2e` 14/14 (incl. the
participant + provider-scope invariants). Prisma Migrate-managed (`0_init` + `1_add_...`); prod via Supabase MCP.

## Out of scope
Payments / billing cycles (Phase 2 — Stripe Connect Express; charges are platform-initiated after the dispute
window, never escrow) · the time entries themselves (time module) · the bid-accept (marketplace) · hire-loop
messaging.
