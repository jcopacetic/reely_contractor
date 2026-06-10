# Contractor — Data-Model Reference
*AppForge · Contractor · v1 work-forward · 2026-06-05*
*Companion to the Technical Proposal. 21 v1 tables + 4 staged reservations. No `tenant_id` anywhere — Contractor is user-scoped and participant-scoped. Field tables are the build reference; the manifest encodes the same shapes machine-readably.*

---

## Access model (the RLS split)

Five shapes, none tenant-scoped:

- **User-scoped** — personal data owned by one User: `contractor_identity`, `contractor_profile` (private fields), `time_entry` (the contractor's own), `stripe_account`, `notification`. RLS: `owner_user_id = auth.uid()`.
- **Participant-scoped** — two-party rows: `listing` (owner + browsable-by-vetted), `bid` (bidder + listing owner), `contract`/`contract_item` (client + contractor), `message_thread`/`message` (participants), `billing_cycle`/`charge`/`payout`/`dispute` (the contract's two parties, financial fields gated). RLS: caller ∈ the row's parties.
- **Public** — `contractor_profile` where `is_public = true`: an unauthenticated read of a safe field subset only.
- **Admin** — `application`, `invite`, vetting transitions, ops reads, `report_summary`, `controller_command`, `feature_flag`. `platform_admin` only.
- **Provider (server-to-server)** — Board's calls (authorized by `CONTRACTOR_SERVICE_KEY`) scoped to a named resource: a listing, a contract, that contract's time entries. Never a blanket export.

**Vetting gate:** every privileged write (bid, contract, payout) re-checks `contractor_identity.status = 'vetted'`.

**Cross-app rule:** `listing.board_part_ref` and `contract.board_ref` are opaque Board ids — references, never FKs/JOINs. Board's `listing_ref`/`contract_ref` point back the same way. The contract is the boundary.

**Reserved-seam realization:** `contractor_identity` *is* the reserved `contractor_identity` seam — a verified professional profile on the base User, owned here.

---

## Principal & Vetting

### `contractor_identity` — the principal *(user-scoped)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| clerk_user_id | string | unique, not null, idx | the base User |
| status | enum | not null, default `applicant` | `applicant` \| `vetted` \| `suspended` |
| vetted_at | timestamp | null | set on approval |
| created_at | timestamp | not null, now() | |
RLS: self read/update of non-status fields; status writable by admin/system only.

### `application` — vetting lifecycle *(admin)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| clerk_user_id | string | not null, idx | applicant |
| source | enum | not null | `apply` \| `invite` |
| status | enum | not null, default `submitted` | `submitted` \| `in_review` \| `approved` \| `rejected` |
| video_link | string | null | out-of-system call link (manual v1) |
| reviewer_id | string | null | admin Clerk id |
| notes | text | null | internal |
| decided_at | timestamp | null | |
| created_at | timestamp | not null, now() | |
RLS: applicant reads own; admin reads/writes all.

### `invite` — invite system *(admin)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| email | string | not null, idx | |
| code | string | unique, not null | redemption token |
| invited_by | string | not null | admin Clerk id |
| status | enum | not null, default `sent` | `sent` \| `accepted` \| `expired` |
| accepted_at | timestamp | null | |
| created_at | timestamp | not null, now() | |

---

## Profile

### `contractor_profile` — public + professional *(user-scoped; public subset)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| contractor_identity_id | relation | unique, not null | 1:1 with identity |
| display_name | string | not null | |
| headline | string | null | one-liner |
| bio | text | null | |
| category_ids | jsonb | not null, default `[]`, GIN idx | skill_category ids; filter source |
| is_public | boolean | not null, default false | gates the public surface |
| public_slug | string | unique, null | shareable URL slug |
| avatar_url | string | null | R2 |
| links | jsonb | not null, default `[]` | simpler-than-Linktree `[{label,url}]` |
| contracts_completed | int | not null, default 0 | system-driven (cached rollup) |
| hours_logged | numeric | not null, default 0 | system-driven (cached rollup) |
| created_at | timestamp | not null, now() | |
| updated_at | timestamp | not null, now() | |
RLS: self read/write; public read of `{display_name, headline, bio, category_ids, avatar_url, links, contracts_completed, hours_logged}` only when `is_public`.

### `skill_category` — curated vocabulary *(admin-managed; public read)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| name | string | unique, not null | |
| slug | string | unique, not null | |
| active | boolean | not null, default true | |
| order | int | not null, default 0 | |
Not derived from Catalog taxonomy (different domain). Reconciliation parked.

---

## Marketplace

### `listing` — a job *(participant; provided to Board)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| owner_user_id | string | not null, idx | the client's Clerk id (Board member or native) |
| board_part_ref | string | null, idx | opaque Board part id when Board-originated (ref, not FK) |
| title | string | not null | |
| description | text | not null | the brief |
| category_ids | jsonb | not null, default `[]`, GIN idx | filter source |
| budget_type | enum | not null | `hourly` \| `fixed` |
| budget_amount | numeric | null | |
| status | enum | not null, default `open` | `open` \| `closed` \| `filled` |
| created_at | timestamp | not null, now() | |
| closed_at | timestamp | null | |
RLS: read by any vetted contractor (browse) + owner; write by owner or Board (provider).

### `bid` — a contractor's offer *(participant)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| listing_id | relation | not null, idx | |
| bidder_user_id | string | not null, idx | contractor Clerk id (must be vetted) |
| rate_type | enum | not null | `hourly` \| `fixed` |
| amount | numeric | not null | |
| hours_estimate | numeric | null | |
| message | text | null | |
| status | enum | not null, default `submitted` | `submitted` \| `countered` \| `denied` \| `accepted` \| `withdrawn` |
| counter_of | relation(self) | null | set when this is a counter |
| created_at | timestamp | not null, now() | |
| updated_at | timestamp | not null, now() | |
RLS: bidder + listing owner. Counters route through messaging.

---

## Contracts

### `contract` — the living container *(participant; provided to Board)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | the `contract_ref` Board grants against |
| listing_id | relation | null | nullable (direct contracts allowed) |
| client_user_id | string | not null, idx | counterparty |
| contractor_user_id | string | not null, idx | the vetted contractor |
| board_ref | string | null, idx | opaque Board id (ref, not FK) |
| title | string | not null | |
| rate_type | enum | not null | `hourly` \| `fixed` |
| rate_amount | numeric | not null | |
| status | enum | not null, default `active` | `active` \| `paused` \| `completed` \| `cancelled` |
| started_at | timestamp | not null, now() | |
| ended_at | timestamp | null | |
| created_at | timestamp | not null, now() | |
| updated_at | timestamp | not null, now() | |
RLS: client + contractor.

### `contract_item` — expandable parts *(participant)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| contract_id | relation | not null, idx | |
| kind | enum | not null | `milestone` \| `scope_add` \| `deliverable` \| `note` |
| title | string | not null | |
| description | text | null | |
| amount | numeric | null | |
| status | enum | not null, default `open` | `open` \| `done` \| `void` |
| order | int | not null, default 0 | |
| created_at | timestamp | not null, now() | |
Inherits the parent contract's participant RLS.

---

## Time

### `time_entry` — logged work *(user-scoped owner + client read/approve; provided to Board)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| contract_id | relation | not null, idx | |
| contractor_user_id | string | not null, idx | owner |
| started_at | timestamp | not null | |
| ended_at | timestamp | null | open while running |
| duration_seconds | int | not null, default 0 | |
| description | text | null | |
| source | enum | not null | `timer` \| `extension` \| `manual` |
| approved | boolean | not null, default false | client approval; **only approved time bills** |
| approved_at | timestamp | null | |
| billing_cycle_id | relation | null, idx | set when swept into a cycle |
| created_at | timestamp | not null, now() | |
RLS: contractor read/write own; client of the contract read + set `approved`.

---

## Messaging *(hire-loop only in v1)*

### `message_thread` *(participant)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| listing_id | relation | null | |
| contract_id | relation | null | one of listing/contract set |
| client_user_id | string | not null, idx | |
| contractor_user_id | string | not null, idx | |
| last_message_at | timestamp | null, idx | |
| created_at | timestamp | not null, now() | |

### `message` *(participant)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| thread_id | relation | not null, idx | |
| sender_user_id | string | not null | |
| body | text | not null | |
| read_at | timestamp | null | |
| created_at | timestamp | not null, now() | |
RLS: thread participants only. General (non-hire) DMs are staged.

---

## Payments *(the financial core)*

### `stripe_account` *(user-scoped)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| contractor_user_id | string | unique, not null | |
| stripe_account_id | string | unique, not null | Express connected account |
| charges_enabled | boolean | not null, default false | |
| payouts_enabled | boolean | not null, default false | |
| kyc_status | enum | not null, default `pending` | `pending` \| `verified` \| `restricted` |
| created_at | timestamp | not null, now() | |
| updated_at | timestamp | not null, now() | |

### `billing_cycle` — the weekly close *(participant; financial fields gated)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| contract_id | relation | not null, idx | |
| period_start | timestamp | not null | 6pm Sunday |
| period_end | timestamp | not null | 6pm next Sunday |
| status | enum | not null, default `open` | `open` \| `dispute_window` \| `charged` \| `disputed` \| `voided` |
| total_seconds | int | not null, default 0 | sum of **approved** time |
| total_amount | numeric | not null, default 0 | |
| take_rate_amount | numeric | not null, default 0 | computed at close |
| dispute_window_ends_at | timestamp | null | close + 7 days |
| charged_at | timestamp | null | |
| created_at | timestamp | not null, now() | |
**Unique `(contract_id, period_start)`** — one cycle per contract per week (idempotency anchor).

### `charge` *(participant; gated)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| billing_cycle_id | relation | unique, not null | one charge per cycle |
| stripe_payment_intent_id | string | unique, null | |
| client_user_id | string | not null | charged party |
| contractor_user_id | string | not null | |
| gross_amount | numeric | not null | |
| take_rate_amount | numeric | not null | |
| net_amount | numeric | not null | to contractor |
| status | enum | not null, default `pending` | `pending` \| `succeeded` \| `failed` \| `refunded` |
| idempotency_key | string | unique, not null | Stripe idempotency |
| created_at | timestamp | not null, now() | |
| succeeded_at | timestamp | null | |

### `payout` *(participant; gated)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| charge_id | relation | not null, idx | |
| stripe_transfer_id | string | unique, null | |
| contractor_user_id | string | not null | |
| amount | numeric | not null | net to contractor |
| status | enum | not null, default `pending` | `pending` \| `paid` \| `failed` |
| created_at | timestamp | not null, now() | |

### `dispute` *(participant)*
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| billing_cycle_id | relation | not null, idx | |
| raised_by_user_id | string | not null | client or contractor |
| reason | text | not null | |
| status | enum | not null, default `open` | `open` \| `resolved_charge` \| `resolved_void` |
| resolution_note | text | null | |
| created_at | timestamp | not null, now() | |
| resolved_at | timestamp | null | |
An `open` dispute on a cycle blocks the platform-initiated charge until resolved.

---

## Baseline furniture

### `feature_flag` *(admin)*
`id` (PK) · `key` (idx) · `user_id` (relation, null = global override) · `enabled` (bool) · `created_at`. Read via `ctx.flags`.

### `app_event` *(user-scoped platform log; append-only)*
`id` · `source` · `type` · `actor_id` · `actor_type` enum `contractor|applicant|admin|client|system|controller` · `payload` jsonb · `occurred_at`. Insert system-only; no updates/deletes.

### `report_summary` *(admin)*
`id` · `scope` (unique: `vetting|marketplace|contracts|payments`) · `data` jsonb · `computed_at` · `stale` bool. Controller report data.

### `controller_command` *(admin/system; append-only)*
`id` · `command_id` (unique, idempotency) · `command` (`pause_payments|pause_vetting|recompute_summary`) · `issued_by` · `status` (`queued|executed|rejected|unknown_command`) · `params` jsonb · `result` jsonb · `executed_at`.

---

## Staged reservations *(designed-for, not built in v1)*
`post`, `follow`, `like`, `reply` — the social layer. Forward-reserved; native Expo mobile lands with this phase. Stable User ids make these additive with no v1 rework.

---

## Relationships (summary)
`contractor_identity` 1—1 `contractor_profile`; `application`/`invite` → a User (by clerk id, not FK). `listing` 1—* `bid`; `listing` 0/1—* `contract`; `contract` 1—* `contract_item`, 1—* `time_entry`, 1—* `billing_cycle`; `billing_cycle` 1—1 `charge` 1—* `payout`, 1—* `dispute`; `message_thread` 1—* `message`. Cross-app: `listing.board_part_ref`, `contract.board_ref` → Board (reference only).

## Financial-correctness invariants (harness-enforced)
1. One `billing_cycle` per `(contract_id, period_start)` — unique.
2. A charge is issued only when `status: dispute_window → charged`, `now > dispute_window_ends_at`, **and** no `open` dispute on the cycle.
3. `charge.idempotency_key` unique; the Stripe webhook is idempotent on event/payment-intent id — no double-charge.
4. Only `approved` `time_entry` rows sum into `total_seconds`/`total_amount`.
5. `take_rate_amount` computed at close and stored on both the cycle and the charge.
6. The N=1 case (a single contractor, one contract, one cycle) runs the full close → window → charge → payout path cleanly.

## Provided-entity shapes (Board consumes)
Board reads/writes a scoped subset server-to-server: create `listing` (post-job), read `bid` (+ aggregate stats), create `contract` (hire) and read `contract_item`, read `time_entry` for a given contract. Detailed in the API-Security Reference. These four — `listing`, `bid`, `contract`(+`contract_item`), `time_entry` — are the portfolio `provides` surface.

---

*Data model locked. Next: the Frontend-Surface Spec.*
*Confidential — Khaotic Digital, LLC*
