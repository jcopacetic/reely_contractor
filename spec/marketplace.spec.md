# marketplace — Contractor Module Spec
*AppForge · Contractor · 2026-06-05 · build order 3/10*

**id:** `marketplace` · **scope:** mvp · **accessType:** core · **environmentType:** background

## Purpose
Owns `listing` + `bid` and the bid lifecycle: post (native owner or Board via the provider surface), bid, counter, deny, accept. Listings carry an opaque `board_part_ref` when Board-originated. The data authority behind the job-feed.

## Triggers
- `create-listing` (manual: native owner session **or** provider/system) — publish a listing.
- `bid-actions` (manual; permission: contractor [vetted]) — submit/withdraw a bid.
- `bid-response` (manual; permission: participant) — counter/deny/accept (listing owner side).
- `provider-intake` (provider; `CONTRACTOR_SERVICE_KEY`) — Board create-listing / read-bids.

## Data access
- **reads:** `listing`, `bid`, `skill_category`
- **writes:** `listing`, `bid`
- **emits:** `listing.posted`, `bid.submitted`, `bid.countered`, `bid.denied`, `bid.accepted`

## Endpoints
- `create-listing` / `get-listing` (action/query) · `submit-bid` / `withdraw-bid` (action; vetted) · `counter-bid` / `deny-bid` / `accept-bid` (action; owner) · `get-bids-for-listing` (query; owner)
- provider: `POST /provider/listings`, `GET /provider/listings/{id}/bids` (`ctx.providerAuth`, resource-scoped)

## Config
- `maxBidsPerListing` (default 100).

## Depends on
`contractor-identity`.

## Acceptance criteria
- `submit-bid`/`accept-bid` enforce `requireVetted()`; bids are participant-scoped (bidder + owner).
- Provider endpoints verify the service key **and** resource ownership; never return an unscoped collection.
- `board_part_ref` stored/treated as an opaque reference (no FK/JOIN to Board).
- Counters route to messaging; `accept-bid` signals contract creation (contracts module).
- `vetting-gate` + `participant-scope-isolation` + `provider-scope` + `cross-app-reference-integrity` harness passes.

## Out of scope
The browse surface (job-feed), contract creation/lifecycle (contracts), message transport (messaging).
