# job-feed — Contractor Module Spec
*AppForge · Contractor · 2026-06-05 · build order 4/10*

**id:** `job-feed` · **scope:** mvp · **accessType:** core · **environmentType:** surface

## Purpose
The v1 work-feed: the discovery/browse surface over `listing`, filtered by `skill_category` (GIN-indexed `category_ids`), budget type, and `open` status. Render-only — bid actions delegate to `marketplace`. Board-originated listings appear identically to native ones. (The *social* feed is staged; this is the work feed.)

## Triggers
- `browse` (manual; permission: contractor [vetted]) — list/filter listings.

## Data access
- **reads:** `listing`, `skill_category`
- **writes:** none
- **emits:** none

## Endpoints
- `list-listings` (query) — filterable, paginated browse over open listings.
- `get-feed-listing` (query) — listing detail for the feed (delegates the bid affordance to marketplace).

## Config
- `feedPageSize` (default 50) · `defaultFilters`.

## Depends on
`marketplace`, `contractor-identity`.

## Acceptance criteria
- Vetted-only browse; un-vetted Users cannot reach the feed.
- Category filtering via the GIN-indexed `category_ids`; budget/status filters work.
- Board-originated listings (with `board_part_ref`) render identically to native ones.
- Valid empty / N=1 state (empty-but-functional feed).
- Render-only (no writes, no bid lifecycle here); `vetting-gate` harness passes.

## Out of scope
Bid lifecycle (marketplace), contract creation (contracts), the social feed (staged).
