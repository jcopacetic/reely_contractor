# @contractor/worker

BullMQ consumer for the Contractor node. The api emits social events via `emit()`; each enqueues a job on the
`contractor` queue. The worker is best-effort and idempotent — a failed/duplicate job never corrupts state.

## What it does (Phase 1)
- **`achievements.process`** (`src/achievements.ts`) — the achievements / XP engine (self-owned, not Catalog).
  For each social event it: (1) extends the contractor's UTC-day activity streak, (2) re-evaluates the
  achievements that event could unlock against **source-of-truth counts** (so a follow/unfollow toggle can't
  inflate progress), and (3) on a fresh unlock grants XP, recomputes the level, and auto-shares a milestone
  post (created directly, NOT via the feed store, so it doesn't re-emit `post.created` or inflate `first_post`).
  Idempotent on the unique `(user, achievement)` award — duplicates never double-grant. Admin/system-actor
  events are skipped (only contractor activity counts toward XP). Rules: `welcomed` (profile.onboarded),
  `first_post` (post.created), `connector` (5 follows), `conversationalist` (10 comments).

`src/connection.ts` defines the shared Redis/BullMQ connection + the `JOBS` registry. Unknown job names throw.

## Phase 2 (stubbed)
`notifications.dispatch` and `payments.billing-cycle` are reserved in the `JOBS` registry and register as their
modules land (notifications dispatch; the weekly Stripe Connect billing cycle).

## Dev
```bash
pnpm --filter @contractor/worker dev        # tsx watch
pnpm --filter @contractor/worker typecheck
```
Env: `REDIS_URL` (default `redis://localhost:6383`) + `DATABASE_URL` (via `@contractor/db`). Achievement
definitions (name/description/xp) come from the seeded `achievement` rows, matched by key.
