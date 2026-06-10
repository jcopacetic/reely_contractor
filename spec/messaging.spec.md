# messaging — Contractor Module Spec
*AppForge · Contractor · 2026-06-05 · build order 8/10*

**id:** `messaging` · **scope:** mvp · **accessType:** core · **environmentType:** interactive

## Purpose
Hire-loop messaging only in v1: threads scoped to a `listing` or `contract`, carrying the client↔contractor negotiation (counter/deny discussion, coordination). Realtime over `ctx.realtime`, participant-filtered. General social DMs are staged.

## Triggers
- `message-actions` (manual; permission: participant) — send/read in a thread.
- `subscribe` (manual; permission: participant) — open an RLS-scoped realtime subscription.

## Data access
- **reads:** `message_thread`, `message`
- **writes:** `message_thread`, `message`
- **emits:** `message.sent`

## Endpoints
- `list-threads` / `get-thread` (query; participant) · `send-message` (action; participant) · `mark-read` (action; participant) · `subscribe` (stream; participant)

## Config
- `maxMessageLen` (default 5000).

## Depends on
`marketplace`, `contracts`, `contractor-identity`.

## Acceptance criteria
- A thread is bound to a listing or contract and visible only to its two parties.
- A counter from `marketplace` opens or appends the relevant thread.
- Realtime delivers new messages only to thread participants (participant-RLS-filtered), delay-tolerant; refetch authoritative.
- `participant-scope-isolation` + `realtime-rls` harness passes.

## Out of scope
General/social DMs (staged), the bid lifecycle (marketplace), the notification bell/email (notifications).
