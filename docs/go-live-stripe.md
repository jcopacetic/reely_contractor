# Go-live checklist — Stripe Connect (payments)

*Payments ship **stubbed**: the whole weekly billing flow runs in prod without real money, and goes live the
moment these env vars are set — no code change. This is the owner's one-time setup. Do it in **test mode**
first, verify a full cycle, then repeat with live keys.*

## 0. Before you start
- The billing engine, worker schedule, webhook, and UI are already deployed (slice 5 / `payments`).
- Until the keys below are set, `payments.payoutAccount.configured` is `false`, the Payouts page shows
  "Stripe in setup — preview mode", and charges/transfers are synthetic (`pi_stub_…` / `tr_stub_…`).

## 1. Enable Connect (Stripe Dashboard)
1. Stripe Dashboard → **Connect** → get started. Platform type: **Platform or marketplace**.
2. Enable **Express** accounts (the contractor onboarding flow we use).
3. Connect → **Settings**: set the platform name, support email, and branding (shown on the Express
   onboarding screens). Note the **Connect client id** (`ca_…`) → `STRIPE_CONNECT_CLIENT_ID`.
4. Fill in the platform profile / responsibilities (Stripe requires this before Express onboarding works).

## 2. Keys
- **Secret key** (`sk_test_…` then `sk_live_…`) → `STRIPE_SECRET_KEY` on **`reely_contractor_api`** AND
  **`reely_contractor_worker`** (the worker initiates charges/transfers on the weekly tick — it needs the key
  too, same lesson as the catalog tier-2 worker-key gap).
- `STRIPE_CONNECT_CLIENT_ID` (`ca_…`) → both services.
- `PLATFORM_TAKE_RATE_PCT` — the platform fee % (default `0`). Net to the contractor = gross − this.
- `APP_BASE_URL` — your public base (e.g. `https://reely.io`) for the Connect return/refresh URLs.

## 3. Webhook endpoint
1. Stripe → **Developers → Webhooks → Add endpoint**.
2. URL: `https://<contractor-api-host>/webhooks/stripe` (the Railway `reely_contractor_api` public URL).
3. Subscribe to these events (all the reconciler handles; others are acknowledged + ignored):
   - `account.updated` — Connect KYC / capabilities → `stripe_account`.
   - `payment_intent.succeeded` — finalize the charge + open the contractor payout.
   - `payment_intent.payment_failed` — mark the charge failed.
   - `charge.dispute.created` — a card chargeback → flag the charge `refunded`.
4. Copy the endpoint's **signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET` on `reely_contractor_api`.
   - Until this is set the webhook **fails closed** (503) — correct, but it means no live reconciliation.

## 4. Client card-on-file (the remaining build, NOT yet implemented)
The charge is **platform-initiated** to the client after the dispute window, which needs the client to have a
**Stripe customer + saved payment method**. That collection flow (a SetupIntent / billing-details step for the
Board client, storing a `stripe_customer_id`) is the **one deferred piece** — `chargeClient` currently creates a
PaymentIntent shell without a saved method. Build + connect this before enabling live charges; until then keep
Stripe in test mode or leave `STRIPE_SECRET_KEY` unset (stub) so no real charge is attempted.

## 5. Verify a full cycle (test mode)
1. Onboard a test contractor via **Payouts → Connect Stripe** (use Stripe's test KYC values). Confirm
   `payoutAccount` flips to `payoutsEnabled: true` after `account.updated` lands.
2. Log + approve some time on a contract.
3. Trigger the weekly job (wait for Sun 18:00 UTC, or have an admin enqueue `payments.billing-cycle`).
4. Confirm: a `billing_cycle` opens (`dispute_window`), and after the 7-day window the next tick creates a
   `charge` → `payment_intent.succeeded` → cycle `charged` + a `payout`. Watch the contractor-api runtime logs
   and the Stripe Dashboard (Payments + Connect → Transfers).
5. Test the dispute path: raise a cycle dispute → confirm the charge is **blocked**; resolve it as admin →
   confirm it charges (or voids).

## 6. Go live
Repeat 1–4 with **live** keys (`sk_live_…`, a live webhook endpoint + `whsec_…`, live `ca_…`). Set
`PLATFORM_TAKE_RATE_PCT` to the real fee. Then redeploy `reely_contractor_api` + `reely_contractor_worker`.

## Rollback / pause
Unset `STRIPE_SECRET_KEY` (or both keys) on the api + worker and redeploy → the engine reverts to **stub** mode:
no real money moves, cycles still open/track in the DB. The webhook fails closed (503) without the keys.
