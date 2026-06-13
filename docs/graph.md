# graph — as-built

*The contractor social graph: follow edges + the authenticated in-club profile view. Distinct from profile's
anonymous public safe-subset — this is the richer view one vetted contractor sees of another.*

## What it does
Owns `follow`. Procedures (`router.ts`, all vetted):
- **`toggleFollow`** — toggle a directed follow edge (follower → followee), unique per pair, no self-follow
  (returns `{ error: 'self' }`). On a new follow emits `follow.created` (the achievements engine consumes it).
  Returns `{ following, followerCount }`.
- **`profile`** (`getClubProfile`) — the authenticated in-club profile of a target contractor as seen by the
  viewer: full profile (displayName, company, position, headline, bio, categories, avatarUrl, links, rollups)
  + follower/following counts + `isFollowing` + `isSelf` + gamification (level / xp / streak from
  `contractor_stats`) + achievement badges (from `achievement_award`). Null if the target has no profile.

## Files
- `apps/api/src/modules/graph/router.ts` — tRPC surface (all `vettedProcedure`).
- `apps/api/src/modules/graph/store.ts` — follow toggle + the aggregated club-profile read.

## Security/scoping
Both procedures are `vettedProcedure` — follows + in-club profiles are a vetted-only club surface. The
follower is always `ctx.clerkUserId` (never input). `getClubProfile` is a richer read than profile's anonymous
`getPublic` and is intentionally gated behind vetting (it exposes level/xp/streak/achievements + follow state
that the public surface must not). RLS exists in `rls.sql` but the store uses the bare `prisma` client (not
`withUser`), so `vettedProcedure` is the real, verified boundary; RLS is a defined backstop for later wiring.

## Verified
`pnpm typecheck` 5/5 · `pnpm test` (unit) 9/9 · `pnpm --filter @contractor/api test:e2e` 14/14. Prisma
Migrate-managed (`0_init` + `1_add_contractor_name_company_position`); prod applied via Supabase MCP.

## Out of scope
Follower-scoped feeds / suggestions / mutuals (v1 is a plain directed edge + counts) · the gamification
*writes* (level/xp/streak + achievement awards are written by the worker's achievements engine; graph only
reads them) · notifications dispatch (consumes the emitted `follow.created`).
