# marketplace — as-built

*The listing + bid data authority behind the job-feed and the Board hire seam. The first work-loop module
with a Board **provider** surface. User-scoped (a listing owner) + participant-scoped (bidder + owner).*

## What it does
Owns `listing` + `bid`. Bid lifecycle: submitted → countered | denied | accepted | withdrawn (countered →
accepted | denied | withdrawn). **Native** procedures (`router.ts`, all vetted):
- **`createListing` / `getListing` / `listMine` / `closeListing`** — a vetted contractor's own listings.
- **`submitBid` / `withdrawBid` / `myBids`** — the bidder side (can't bid on your own listing; capped at
  `MAX_BIDS_PER_LISTING` = 100 active bids; emits `bid.submitted`).
- **`getBidsForListing` / `counterBid` / `denyBid` / `acceptBid`** — the listing-owner side. `acceptBid`
  marks the listing `filled` and emits `bid.accepted` (the **contracts** module forms the actual Contract).

**Provider** sub-router (`marketplace.provider.*`, all serviceProcedure — Board's `/provider/*`):
`createListing` (with `ownerUserId` + `boardPartRef`), `listBids` (+ aggregate stats), `counterBid` /
`denyBid` / `acceptBid` (called with `ownerUserId = null`), and `skillCategories` (the tagging vocab).

## Files
- `apps/api/src/modules/marketplace/router.ts` — native (vetted) + provider (service-key) surfaces.
- `apps/api/src/modules/marketplace/store.ts` — listing/bid lifecycle, `transitionBid`, provider helpers.

`toListingView` / `bidCounts` are re-used by the job-feed module (its read-only browse).

## Security/scoping
Native procedures are `vettedProcedure`; the owner is `ctx.clerkUserId`. Bid transitions assert listing
ownership (`l.ownerUserId !== ownerUserId → forbidden`). The **provider surface is `serviceProcedure`
(service-key only) AND resource-scoped to Board-originated entities**: `transitionBid(..., ownerUserId=null)`
and `providerListBids` require a non-null `boardPartRef`, refusing native listings (`forbidden`) — never an
unscoped collection. `board_part_ref` / `listing_ref` are opaque cross-app references, never FKs/JOINs to
Board. RLS exists in `rls.sql` but the store uses the bare `prisma` client (not `withUser`), so the app-layer
owner/participant + provider boardPartRef checks are the real, verified boundary; RLS is a defined backstop.

## Verified
`pnpm typecheck` 5/5 · `pnpm test` (unit) 9/9 · `pnpm --filter @contractor/api test:e2e` 14/14 (incl. the
provider-scope invariant — native listings are never exposed via the provider surface). Prisma Migrate-managed
(`0_init` + `1_add_...`); prod applied via Supabase MCP.

## Out of scope
The Contract itself (contracts module; `acceptBid` only emits `bid.accepted`) · time tracking + payments
(Phase 2 — Stripe Connect Express is stubbed/keyless locally) · hire-loop negotiation messaging.
