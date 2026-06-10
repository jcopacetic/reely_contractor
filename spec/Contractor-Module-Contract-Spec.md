# Contractor — Module-Contract Spec
*AppForge · Contractor · v1 work-forward · 2026-06-05*
*The ModuleContext adaptation, the harness assertion catalog, and the two environment docs every module is built against. Locks the shared `ctx` shape so each module is built in an isolated session.*

---

## ModuleContext (`ctx`)

Baseline (all AppForge nodes): `ctx.db`, `ctx.events`, `ctx.queue`, `ctx.flags`, `ctx.error`.

**Contractor extensions:**

- **`ctx.db`** — query/transaction with **user-scoped + participant-scoped** RLS helpers. No `tenant_id`; instead `ctx.db.asUser(userId)` and participant predicates (`partyOf(contractId)`, `ownerOrBrowsable(listing)`). Cross-tenant concepts do not exist.
- **`ctx.identity`** — the current principal: `{ userId, vettingStatus }`. `ctx.identity.requireVetted()` throws `403` unless `status = 'vetted'` (the hard-gate helper).
- **`ctx.stripe`** — Connect surface: `createAccountLink`, `getAccountStatus`, `createCharge({ idempotencyKey, ... })`, `createTransfer` (payout), `verifyWebhook(sig, body)`. Idempotency is mandatory on charge.
- **`ctx.realtime`** — Supabase Realtime publish/subscribe, **participant-RLS-filtered**; used for bid arrival + new messages. Delay-tolerant; refetch authoritative.
- **`ctx.comms`** — Resend email (hire-loop, payment/cycle, dispute, vetting decisions).
- **`ctx.providerAuth`** — authorizes inbound Board (server-to-server) calls: verifies `CONTRACTOR_SERVICE_KEY` **and** that the named resource belongs to the calling relationship; rejects any unscoped/list-all access.
- **`ctx.queue`** — BullMQ: the weekly **billing-cycle worker**, Stripe reconciliation, vetting side-effects, notification dispatch.
- **`ctx.flags`** — `FeatureFlag` (global, optional per-`user_id` override).

**Deliberately absent:** `ctx.tree`, `ctx.tenant`, `ctx.scaffold`, `ctx.access` (those are Board's). Contractor has no tenant overlay and no project tree.

---

## The Contractor harness (assertion catalog)

Every module's isolated build session runs against these. Grouped:

**Isolation**
- `user-scope-isolation` — a User cannot read/write another User's user-scoped rows (`contractor_identity`, own `time_entry`, `stripe_account`, `notification`).
- `participant-scope-isolation` — a non-party cannot read a `contract`, `bid`, `message_thread`, `billing_cycle`, `charge`, or `dispute`.
- `public-field-discipline` — the public profile endpoint returns only the safe subset and only when `is_public`; a non-public slug `404`s; no financial/client/private field is ever serializable on a public path.

**Vetting**
- `vetting-gate` — an `applicant`/`suspended` User receives `403` on `submit-bid`, `accept-bid`, contractor-side contract participation, and payout, regardless of UI state.

**Provider boundary**
- `provider-scope` — a `/provider/*` call without a valid `CONTRACTOR_SERVICE_KEY` is rejected; a valid key cannot read a resource outside its relationship; no provider endpoint returns an unscoped collection.
- `cross-app-reference-integrity` — `board_part_ref`/`board_ref` are treated as opaque references; no JOIN/FK to Board is attempted.

**Financial correctness** *(the highest-risk set)*
- `one-cycle-per-week` — unique `(contract_id, period_start)`; the worker never duplicates a cycle.
- `no-charge-in-dispute` — no charge while an `open` dispute exists on the cycle.
- `no-charge-before-window` — no charge before `now > dispute_window_ends_at`.
- `idempotent-charge` — replaying the close (or a Stripe event) issues at most one `charge`; `idempotency_key` + unique `billing_cycle_id` hold.
- `approved-time-only` — cycle totals sum only `approved` time entries.
- `take-rate-stored` — `take_rate_amount` computed at close and persisted on cycle + charge; `net = gross − take_rate`.
- `payout-after-success` — a `payout` is created only after its `charge` is `succeeded`.
- `n1-cycle` — one contractor, one contract, one cycle runs the full close → window → charge → payout path cleanly (no founder-special branch).

**Webhook**
- `webhook-signature` — unsigned/invalid Stripe payloads rejected.
- `webhook-idempotency` — replayed Stripe events are no-ops; no double reconciliation.

**Realtime**
- `realtime-rls` — subscriptions deliver only participant-reachable rows (a contractor sees bids on their own listings + messages in their own threads, nothing else).

**Model**
- `static-model` — no runtime module lifecycle; build-time isolation only. No `tenant_id` appears anywhere.

---

## ENV_BACKGROUND
*Context for background/service modules: `contractor-identity`, `marketplace`, `contracts`, `time`, `payments`, `notifications`, `contractor-admin` (service side).*

- Runs server-side (Fastify) + workers (BullMQ on Railway). No direct UI.
- Available: `ctx.db`, `ctx.identity`, `ctx.events`, `ctx.queue`, `ctx.flags`, `ctx.error`, plus module-relevant extensions (`ctx.stripe` for payments, `ctx.providerAuth` for marketplace/contracts/time, `ctx.comms` for notifications/identity).
- Writes are authoritative; emits domain events; honors the vetting gate and the financial guards.
- The billing-cycle worker is the canonical scheduled job (weekly close); Stripe reconciliation is event-driven.

## ENV_SURFACE
*Context for surface modules: `profile` (public + club), `job-feed`, `messaging` (client), the club-app shell, the admin console, the extension.*

- Runs in Next.js (SSR) behind Clerk (except the public profile path) + the extension runtime.
- **Render-only / delegate writes:** surfaces call module endpoints; no direct table writes, no direct Stripe calls.
- Reads are RLS-scoped via `ctx.db` (or the public safe-subset reader); subscribes to `ctx.realtime` for bids/messages.
- Vetting-gated affordances are hidden client-side **and** enforced server-side.

---

## Module → environment map
`contractor-identity` background · `profile` surface · `job-feed` surface · `marketplace` background (+ surface affordances) · `contracts` background · `time` interactive (timer surface + service) · `payments` background · `messaging` interactive · `notifications` background · `contractor-admin` interactive · `social` STAGED.

---

*Module-contract locked. Next: the LLM Context Profile.*
*Confidential — Khaotic Digital, LLC*
