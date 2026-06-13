# dm — as-built

*General social direct messages (contractor ↔ contractor). 1:1 threads; every read/write is
participant-gated. This is the social-club DM — the work hire-loop messaging is a separate Phase 2 concern.*

## What it does
Owns `dm_thread` + `dm_message`. A thread's participant pair is stored sorted (`userA < userB`) so (a,b) and
(b,a) resolve to one canonical thread. Procedures (`router.ts`, all vetted):
- **`threads`** — the viewer's threads, newest-activity first, each with the other participant + last message
  + unread count.
- **`open`** — find-or-create the 1:1 thread with another contractor (no self-thread; the other must have a
  profile). Returns `{ threadId, other }`.
- **`messages`** — a thread's messages oldest→newest (participant-gated); also marks the other party's unread
  messages read. Keyset-paginated on `createdAt` (`before`).
- **`send`** — send a message (participant-gated); bumps `lastMessageAt`; emits `dm.sent`.
- **`unreadCount`** — total unread messages addressed to the viewer (for the nav badge).

## Files
- `apps/api/src/modules/dm/router.ts` — tRPC surface (all `vettedProcedure`).
- `apps/api/src/modules/dm/store.ts` — sorted-pair thread keying, participant gates, read receipts.

## Security/scoping
`vettedProcedure` (vetted-only club) PLUS an explicit **participant gate** in the store on every thread
read/write: the viewer must be `userA` or `userB` of the thread, else `{ error: 'forbidden' }` (a non-member
can't read or send). The viewer is always `ctx.clerkUserId` (never input). RLS exists in `rls.sql` but the
store uses the bare `prisma` client (not `withUser`), so the **app-layer participant check is the real,
verified boundary**; RLS is a defined backstop to be wired via `withUser` later — do not rely on it.

## Verified
`pnpm typecheck` 5/5 · `pnpm test` (unit) 9/9 · `pnpm --filter @contractor/api test:e2e` 14/14 (incl. a
participant-scope invariant). Prisma Migrate-managed (`0_init` + `1_add_...`); prod applied via Supabase MCP.

## Out of scope
Realtime delivery (v1 is server-action reads + a light client poll while a thread open) · group threads
(1:1 only) · attachments/media · the hire-loop / bid-negotiation messaging (a separate Phase 2 surface) ·
notifications dispatch (consumes the emitted `dm.sent`).
