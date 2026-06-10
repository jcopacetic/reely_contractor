# notifications — Contractor Module Spec
*AppForge · Contractor · 2026-06-05 · build order 9/10*

**id:** `notifications` · **scope:** mvp · **accessType:** core · **environmentType:** background

## Purpose
The **sole writer of `notification`**. Turns hire-loop, payment/cycle, dispute, and vetting events into bell entries (in-app) and email (the configured subset), bidirectional client↔contractor. Publishes the bell over `ctx.realtime`; dispatches email via `ctx.comms`.

## Triggers
- `dispatch` (event: `bid.submitted`, `bid.accepted`, `bid.denied`, `message.sent`, `contract.created`, `payment.charged`, `payment.failed`, `dispute.opened`, `dispute.resolved`, `contractor.approved`, `contractor.rejected`; permission: system)
- `read` (manual; permission: self) — list/mark-read.

## Data access
- **reads:** `notification`
- **writes:** `notification`
- **emits:** none (consumes events; dispatches email via `ctx.comms`; publishes bell via `ctx.realtime`)

## Endpoints
- `list-notifications` (query; self) · `mark-read` (action; self) · internal `dispatch(event)`

## Config
- `emailEventTypes` (default `bid_accepted`, `hired`, `payment_charged`, `dispute_opened`, `vetting_decision`) · `maxPerRecipientPerMin` (default 30).

## Depends on
`contractor-identity` (recipient resolution); consumes events from most modules.

## Acceptance criteria
- Bell entries for hire-loop + payment/cycle + dispute + vetting events; email only for the configured set.
- Recipients resolved by user/participant scope; bidirectional (client and contractor).
- Sole writer of `notification`; user-scoped reads; throttled.
- `user-scope-isolation` harness passes.

## Out of scope
The message thread transport (messaging), DMs, the realtime channel mechanics beyond publishing the bell.
