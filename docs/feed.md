# feed — as-built

*The contractor social club feed: posts + reactions + threaded comments. Lifted from Stumble's reaction/
comment patterns. v1 is a single club-wide feed (the club is small + exclusive).*

## What it does
Owns `post` + `reaction` + `comment`. Procedures (`router.ts`, all vetted):
- **`createPost`** — create a post (`body` ≤5000, `kind` = update | milestone | achievement); bumps the
  author's `contractor_stats.post_count`; emits `post.created` (the achievements engine consumes it).
- **`list`** — newest-first club-wide feed, keyset-paginated on `createdAt` (`before`), each post hydrated
  with the author's profile + the caller's own reaction.
- **`byAuthor`** — a single contractor's posts (their timeline).
- **`react`** — one reaction per (user, post); re-reacting the same type clears it, a different type switches
  it. Maintains `post.reaction_count` as a delta. Returns `{ myReaction, reactionCount }`.
- **`addComment`** — add a comment or reply (`parentId`); bumps `post.comment_count`; emits `comment.created`.
- **`comments`** — a post's comments, oldest-first flat with `parentId` (the client threads them), bounded
  `take 100` with `after` keyset pagination.

## Files
- `apps/api/src/modules/feed/router.ts` — tRPC surface (all `vettedProcedure`).
- `apps/api/src/modules/feed/store.ts` — post/reaction/comment logic, profile hydration, count deltas.

## Security/scoping
Every procedure is `vettedProcedure` — the feed is the vetted-only club, so being a vetted contractor is the
whole authorization model (there is no per-post ownership gate on reading; the club is the audience). Author
identity is taken from `ctx.clerkUserId`, never from input. Reactions are uniquely keyed on (user, post) so a
user can't inflate a count. RLS exists in `rls.sql` but the store uses the bare `prisma` client (not
`withUser`), so `vettedProcedure` is the real, verified boundary; RLS is a defined backstop for later wiring.

## Verified
`pnpm typecheck` 5/5 · `pnpm test` (unit) 9/9 · `pnpm --filter @contractor/api test:e2e` 14/14. Prisma
Migrate-managed (`0_init` baseline + `1_add_contractor_name_company_position`); prod applied via Supabase MCP.

## Out of scope
Follower-scoped / ranked feeds (v1 is club-wide newest-first) · media upload to R2 (post body is text in v1)
· realtime fan-out (reads are server-action + refetch) · notifications dispatch (consumes the emitted events).
The achievements/XP grant for `post.created`/`comment.created` runs on the worker, not here.
