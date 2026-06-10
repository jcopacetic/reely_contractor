# payments — Contractor Module Spec
*AppForge · Contractor · 2026-06-05 · build order 7/10*

**id:** `payments` · **scope:** mvp · **accessType:** core · **environmentType:** background

## Purpose
The financial-correctness core. Stripe Connect (Express) onboarding; the weekly **billing-cycle worker** (6pm Sun → 6pm Sun); the 7-day dispute window; the **platform-initiated delayed charge** after the window; the take-rate; payouts. **Not escrow** — the client's method is charged at cycle close, then transferred to the contractor minus the take-rate.

## Triggers
- `connect-onboard` (manual; permission: contractor [self]) — Stripe Express onboarding.
- `billing-cycle` (cron/worker; permission: system) — the weekly close.
- `stripe-webhook` (webhook; signature-verified, no session) — reconciliation.
- `dispute` (manual; permission: participant) — raise a dispute during the window.
- `resolve-dispute` (manual; permission: platform_admin).

## Data access
- **reads:** `billing_cycle`, `charge`, `payout`, `dispute`, `stripe_account`, `contract`, `time_entry`
- **writes:** `billing_cycle`, `charge`, `payout`, `dispute`, `stripe_account`
- **emits:** `cycle.opened`, `dispute_window.opened`, `payment.charged`, `payment.failed`, `dispute.opened`, `dispute.resolved`, `payout.paid`

## Endpoints
- `connect-onboard` / `get-account-status` (action/query; self) · `raise-dispute` (action; participant) · `resolve-dispute` (action; admin) · `stripe-webhook` (signature)
- worker: `run-billing-cycle` (system)

## Config
- `cycleCloseDayHour` (default Sun 18:00) · `disputeWindowDays` (default 7) · `takeRatePct` (flag-gated) · `currency` (default usd).

## Depends on
`contracts`, `time`, `contractor-identity`.

## Acceptance criteria
- **One `billing_cycle` per `(contract_id, period_start)`**; the worker upserts, never duplicates.
- A charge is issued only on `dispute_window → charged`, `now > dispute_window_ends_at`, and **no `open` dispute**.
- Idempotent charge (`idempotency_key` + unique `billing_cycle_id`); webhook signature-verified + idempotent on event id — no double-charge.
- Cycle totals sum **only `approved` time**; `take_rate` computed at close, stored on cycle + charge; `net = gross − take_rate`.
- Payout only after a `succeeded` charge; Express onboarding (`payouts_enabled`) gates payout.
- The **N=1** path runs close → window → charge → payout cleanly.
- All financial + `webhook-signature` + `webhook-idempotency` harness assertions pass.

## Out of scope
Time approval + the timer (time), escrow (explicitly not used), Board's billing UI, the take-rate business decision (flag).
