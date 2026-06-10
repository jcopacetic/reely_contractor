# Contractor — API-Security Reference
*AppForge · Contractor · v1 work-forward · 2026-06-05*
*Companion to the Data-Model + Frontend specs. Defines auth, the five access shapes enforced at the API layer, the vetting hard-gate, the scoped server-to-server provider surface Board calls, Stripe webhook security, and the financial-correctness guards.*

---

## Auth model
Clerk authenticates the **User** only — no organizations, no tenants. Every authenticated request resolves to a Clerk User id; there is **no `tenant_id`** in any policy. Server-to-server calls from Board carry a service credential, not a user session.

---

## The five access shapes (enforced server-side)

1. **User-scoped** — `owner_user_id = auth.uid()`: `contractor_identity`, `contractor_profile` (private fields), `time_entry` (own), `stripe_account`, `notification`.
2. **Participant-scoped** — caller ∈ the row's parties: `listing` (owner + browsable-by-vetted), `bid` (bidder + listing owner), `contract`/`contract_item` (client + contractor), `message_thread`/`message` (participants), `billing_cycle`/`charge`/`payout`/`dispute` (the contract's two parties; financial fields read-gated).
3. **Public** — unauthenticated read of the `contractor_profile` safe subset where `is_public = true`. No other public reads.
4. **Admin** — `platform_admin` only: vetting (`application`/`invite`), ops, `report_summary`, `controller_command`, `feature_flag`.
5. **Provider (server-to-server)** — Board's calls, authorized by `CONTRACTOR_SERVICE_KEY`, **scoped to a named resource** — never a list-all/export.

RLS is the backstop on every table; endpoint guards are the first line. Affordances hidden in the UI are still enforced here.

---

## Vetting hard-gate
Every privileged write — `submit-bid`, `accept-bid`, contract participation as the contractor, payout — re-checks `contractor_identity.status = 'vetted'` at the endpoint, independent of UI state. An `applicant` calling a gated endpoint gets `403`. Suspension flips the same gate closed immediately.

---

## Public-field discipline
The public profile endpoint returns only `{display_name, headline, bio, category_ids→labels, avatar_url, links, contracts_completed, hours_logged}` and only when `is_public = true`. Financial data, client identities, contract content, contact details, and any private profile field are never serializable on a public path. A non-public slug returns `404` (not `403`, to avoid existence leakage).

---

## Provider surface (Board → Contractor)
All under `/provider/*`, authorized by `CONTRACTOR_SERVICE_KEY` and **resource-scoped** to the calling relationship. No endpoint returns an unscoped collection.

| Endpoint | Method | Scope check | Maps to |
|---|---|---|---|
| `/provider/listings` | POST | caller posts on behalf of a client; stores `board_part_ref` | create `listing` |
| `/provider/listings/{id}/bids` | GET | listing owned by the calling relationship | read `bid` + stats |
| `/provider/contracts` | POST | references an accepted bid / listing the caller owns | create `contract` (hire) |
| `/provider/contracts/{id}` | GET | caller ∈ contract parties | read `contract` + `contract_item` |
| `/provider/contracts/{id}/time-entries` | GET | caller ∈ contract parties | read `time_entry` for **that contract only** |
| `/provider/time-entries/{id}/approve` | POST | caller is the contract's client | set `time_entry.approved` |

This is the entire cross-app write/read surface. The contractor-as-person reaching **into** Board is the opposite direction and is governed by Board's `access-control` grant (keyed on `contract_ref`), not by anything here.

---

## Stripe webhook security
- **Signature-verified** on every inbound event (`STRIPE_WEBHOOK_SECRET`); unverified payloads rejected.
- **Idempotent on the Stripe event id** — a replayed event is a no-op; reconciliation of `charge`/`payout`/account status never double-applies.
- Connected-account (`account.updated`) events update `stripe_account.charges_enabled`/`payouts_enabled`/`kyc_status`.
- No charge is ever initiated from the webhook path; charges originate only from the billing-cycle worker under the guards below.

---

## Financial-correctness guards (worker + API)
The invariants from the Data-Model Reference, enforced as hard conditions:
1. **One cycle per contract-week** — unique `(contract_id, period_start)`; the worker upserts, never duplicates.
2. **Charge only when** `billing_cycle.status: dispute_window → charged`, `now > dispute_window_ends_at`, **and** no `open` `dispute` on the cycle. Any open dispute holds the charge.
3. **Idempotent charge** — `charge.idempotency_key` unique + passed to Stripe; one `charge` row per cycle (unique `billing_cycle_id`).
4. **Approved time only** — `total_seconds`/`total_amount` sum only `time_entry.approved = true`.
5. **Take-rate** computed at close, stored on both `billing_cycle` and `charge`; `net_amount = gross − take_rate`.
6. **Payout** follows a `succeeded` charge only.
These six are the contractor harness's financial assertions, including the N=1 path.

---

## Endpoint inventory by module (auth · scope)

- **contractor-identity** — `apply` (session) · `redeem-invite` (session) · `get-status` (session, self) · `review`/`approve`/`reject` (admin).
- **profile** — `get-own`/`update`/`set-public` (session, self) · `get-public` (public, safe subset).
- **skill-categories** — `list` (session/public) · `manage` (admin).
- **marketplace** — `list-listings`/`get-listing` (session, vetted) · `submit-bid` (session, vetted) · `counter`/`deny`/`accept` (participant) · `list-my-bids` (session, self) · `get-bids-for-listing` (owner) · *(provider create/read above)*.
- **contracts** — `get-contract`/`add-item`/`update-status` (participant) · *(provider create above)*.
- **time** — `start`/`stop`/`manual` (session, contractor on own contract) · `list-time` (participant) · `approve` (client participant) · *(provider read/approve above)*.
- **payments** — `connect-onboard` (session, self) · `stripe-webhook` (signature, no session) · `raise-dispute` (participant) · `resolve-dispute` (admin) · `run-billing-cycle` (system/worker).
- **messaging** — `list-threads`/`get-thread`/`send` (participant).
- **notifications** — `list`/`mark-read` (session, self).
- **contractor-admin** — vetting queue, ops summary (admin) · controller `report`/`command`/`health` (system).

---

## Abuse, PII, controller
- **Rate limiting:** per-User on bid/message/apply; per-account on provider endpoints; standard backpressure on webhooks.
- **PII:** profiles + payment data are PII; GDPR delete/export honored; Stripe holds KYC (we store only status + account id).
- **Controller:** report/command/health authorized by `CONTROLLER_API_KEY`; commands idempotent on `command_id` (`pause_payments`, `pause_vetting`, `recompute_summary`); event-push signed with `CONTROLLER_WEBHOOK_SECRET`.

---

*Reference docs complete (Data-Model · Frontend-Surface · API-Security). Next: the Module-Contract Spec.*
*Confidential — Khaotic Digital, LLC*
