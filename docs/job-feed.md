# job-feed — as-built

*The v1 work feed: a READ-ONLY, vetted-only browse over open listings. A thin read layer over marketplace's
data — it never writes (all bid affordances delegate to the marketplace module).*

## What it does
Reads `listing` (owned by marketplace). Procedures (`router.ts`, all vetted):
- **`list`** — open listings, newest-first, keyset-paginated (`before`), filterable by `categoryIds` (skill
  overlap via `hasSome`, GIN-indexed) and `budgetType`. No category filter ⇒ all open listings (so the feed
  isn't empty when a contractor's skills don't overlap).
- **`get`** — one open listing's detail + whether the viewer already has an active bid on it. Null on a
  closed / filled / missing listing.
- **`myCategories`** — the viewer's own profile skill categories (the "matches my skills" default the web
  passes as the filter).

Board-originated listings (carrying a `boardPartRef`) render identically to native ones.

## Files
- `apps/api/src/modules/job-feed/router.ts` — tRPC surface (all `vettedProcedure`).
- `apps/api/src/modules/job-feed/store.ts` — the filtered read; re-uses marketplace's `bidCounts` /
  `toListingView` (this module owns no tables).

## Security/scoping
Every procedure is `vettedProcedure` — only vetted contractors browse work. The viewer is `ctx.clerkUserId`.
The module is **read-only** — it issues no writes, so the bid-write authorization lives entirely in
marketplace. Reads are scoped to `status: 'open', deletedAt: null`. RLS exists in `rls.sql` but the store
uses the bare `prisma` client (not `withUser`), so `vettedProcedure` is the real, verified boundary; RLS is
a defined backstop for later wiring.

## Verified
`pnpm typecheck` 5/5 · `pnpm test` (unit) 9/9 · `pnpm --filter @contractor/api test:e2e` 14/14. Prisma
Migrate-managed (`0_init` + `1_add_...`); prod applied via Supabase MCP.

## Out of scope
Ranking / personalization beyond skill-overlap + recency · saved searches / alerts · bidding itself (delegated
to marketplace) · any write path (this module is read-only by design).
