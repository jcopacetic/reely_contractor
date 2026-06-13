# payments — as-built

*Contractors get paid for **approved** time. A weekly `billing_cycle` per (contract, period) sweeps approved,
un-billed, un-disputed time, opens a **7-day dispute window**, then **platform-initiates** a charge to the client
and a transfer (net = gross − take rate) to the contractor's Stripe Connect account — **not escrow**. Stripe is
**stubbed when unset**, so the whole flow runs locally + in prod without real money and goes live on config.*

## What it does
Owns `stripe_account`, `billing_cycle`, `charge`, `payout`, `cycle_dispute` (and the
`time_entry.billing_cycle_id` link). The billing engine lives in `modules/payments/store.ts`; the weekly sweep +
charge run on the **worker**; the **webhook** reconciles state from Stripe.

### Native procedures (`router.ts`)
- **`payoutAccount`** *(vetted)* — the contractor's Connect account status (`connected`, `configured`,
  `payoutsEnabled`, `chargesEnabled`, `kycStatus`), or `connected:false` if they haven't onboarded.
- **`startOnboarding`** *(vetted)* — ensures a Connect Express account and returns an onboarding link to
  complete KYC. Stub → a placeholder URL back to `/contractor/payouts`.
- **`cycles`** *(vetted, participant-gated)* — a contract's billing cycles with charge/payout/dispute status.
  The contract's client or contractor only; anyone else gets `null`.
- **`raiseDispute`** *(vetted, participant)* — contests a cycle still in its window; sets it `disputed`, which
  **blocks the charge** until an admin resolves it.
- **`resolveDispute`** *(admin)* — `charge` (back into the window) or `void` (cancel the cycle).

### Provider procedure (Board)
- **`provider.cycles({ contractRef })`** *(service-key)* — a **Board-originated** contract's cycles (what the
  client will be billed). **boardRef-scoped** (only contracts carrying a `boardRef`); read-only. Board reaches
  this via `contractor.getBillingCycles` → its `hiring.billingCycles` proc → the work-detail Billing section.

## The cycle lifecycle
`open → dispute_window → charged` (happy path); `→ disputed → (dispute_window | voided)` on a dispute;
`→ voided` when gross ≤ 0.

1. **Sweep** (`sweepCycle(contractId, periodStart, periodEnd)`): sums the contract's **approved, un-billed,
   un-disputed, ended** time entries; **upserts** the cycle (idempotent on the unique `(contract_id,
   period_start)`); stamps those entries' `billing_cycle_id`; computes `total_amount` (hourly: seconds/3600 ×
   rate; fixed: rate) + `take_rate_amount` (`PLATFORM_TAKE_RATE_PCT`, default 0). Status → `dispute_window`,
   `dispute_window_ends_at = period_end + 7d`. Emits `cycle.opened`. Skips a cycle already `charged`/`voided`.
2. **Charge** (`chargeDueCycles(now)`): finds cycles `dispute_window` with `dispute_window_ends_at ≤ now`, **no
   existing charge**, **no open `cycle_dispute`**, and **no disputed entry**. Gross ≤ 0 → `voided`. Else
   `chargeClient` (PaymentIntent) → a `charge` row. In **stub** mode it settles synchronously: a `payout`
   (`paid`) + the cycle `charged` + `payment.charged`. In **live** mode the charge starts `pending` and the
   **webhook** finalizes it. The `charge: null` filter is the double-charge guard.

## Disputes (two levels)
- **Per-entry** (`time.dispute`, slice 2) — the client contests one time entry; a disputed entry is excluded
  from the sweep and blocks its cycle's charge.
- **Per-cycle** (`payments.raiseDispute`) — a participant contests the whole cycle after it's swept; an admin
  resolves (`charge`/`void`). Either level keeps money from moving until it's settled.

## Worker (`apps/worker/src/payments.ts` + `scheduler.ts`)
A repeatable BullMQ job **`payments.billing-cycle`** (cron `0 18 * * 0` — **Sun 18:00 UTC**), registered on boot
(deduped on its repeat key). Each tick: (1) `chargeDueCycles` settles last week's cycles whose window has
closed, then (2) sweeps each contract with un-billed approved time into the **just-completed week**
(`lastCompletedWeek`, snapped to the Sunday 18:00 boundary so re-runs are idempotent). A cycle opened one
Sunday is charged the next. Admins can enqueue the same job ad-hoc.

## Webhook (`apps/api/src/webhooks/stripe.ts`)
`POST /webhooks/stripe`, encapsulated raw-body route. **Fails closed**: 503 when Stripe/secret unset, 400 on a
missing/bad signature — a forged event never reaches the reconciler. **Idempotent** (every branch is an
idempotent update; no event-id dedup table needed) and it **never initiates a charge**. Reconciles:
`account.updated` → `stripe_account` capabilities/KYC; `payment_intent.succeeded` → charge `succeeded` + cycle
`charged` + the contractor payout (transfer); `payment_intent.payment_failed` → charge `failed`;
`charge.dispute.created` (chargeback) → charge `refunded`.

## Stripe client (`apps/api/src/clients/stripe.ts`) — stub when unset
Singleton `stripe(): Stripe | null` (null when `STRIPE_SECRET_KEY` unset). Helpers each return a deterministic
stub when null: `createConnectAccount` (`acct_stub_…`), `onboardingLink`, `accountStatus`, `chargeClient`
(`pi_stub_…`, logs "would charge"), `transferToContractor` (`tr_stub_…`). The DB (`billing_cycle`/`charge`/
`payout`) is authoritative either way. No card data is ever stored here.

## Web surfaces
- **`/contractor/payouts`** — Connect onboarding status + a "Connect Stripe to get paid" / "Complete setup"
  button (stub flow says "Stripe in setup — preview mode"). A **Payouts** rail entry.
- **Contract Billing panel** (`components/billing-panel.tsx`) — replaces the old "coming soon" placeholder on
  the contract detail. Per-cycle: period, hours, amount, status, dispute-window countdown, payout status; the
  contractor sees their net, the client sees the gross; a participant can dispute a cycle in its window.
- **Board** (`/projects/work/[contractRef]`) — a read-only **Billing** section: the workspace's upcoming/charged
  cycles (period, hours, amount, status). The **client card-on-file collection** is a go-live follow-up (see
  the setup checklist), so live charges are stubbed until then.

## Env
All optional → stub mode. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`,
`PLATFORM_TAKE_RATE_PCT` (default `0`), `APP_BASE_URL` (Connect return/refresh URLs; default `https://reely.io`).

## RLS (backstop — app guards are the real boundary)
`stripe_account` owner-read; `billing_cycle`/`charge` participant-read (via the contract); `payout`
contractor-own; `cycle_dispute` participant for all; system/admin write everywhere.

## Definition of done
e2e (`contractor.e2e.test.ts`, "payments — billing engine"): sweep sums only approved/un-billed time + computes
the amount + stamps the cycle (idempotent); participant-gated reads (non-participant blocked); an open dispute
blocks the charge until an admin resolves; a due cycle charges in stub (charge `succeeded` + payout `paid` +
cycle `charged`); no re-charge; Connect onboarding; vetting/admin gating. Webhook fail-closed unit test. See
`go-live-stripe.md` for the owner's Connect setup checklist.
