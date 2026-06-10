# Contractor — Frontend-Surface Spec
*AppForge · Contractor · v1 work-forward · 2026-06-05*
*Companion to the Technical Proposal + Data-Model Reference. Defines the surfaces, routes, role-gated affordances, and cross-surface concerns. v1 is responsive web, API-first; the social feed and native Expo mobile are staged.*

---

## Surface inventory

| Surface | Auth | Roles | Device | Realtime | Render |
|---|---|---|---|---|---|
| Public marketing profile | none | public | responsive | no | SSR/ISR (SEO-light) |
| Club app | Clerk session | contractor, applicant (limited) | responsive web | yes (scoped) | SSR |
| Admin console | Clerk session | platform_admin | desktop | no | SSR |
| Browser-extension timer | Clerk session | contractor | extension | no | extension runtime |
| *(staged)* Social feed | Clerk session | contractor | web + native Expo | yes | — |

---

## 1. Public marketing profile *(the one public surface)*

The only unauthenticated surface. Simpler-than-Linktree: a shareable card backed by `contractor_profile` where `is_public = true`. The club interior stays private behind it.

- **Route:** `/c/[public_slug]` — public, shareable, SEO-light (ISR).
- **Renders only the safe public subset:** `display_name`, `headline`, `bio`, `category_ids` (as labels), `avatar_url`, `links`, and the system-driven `contracts_completed` + `hours_logged`. No contact details, no contract/financial data, no client names.
- **No public directory in v1** — profiles are reachable by link only (a directory is a social-phase decision). A profile with `is_public = false` 404s publicly.
- CTA: "Apply to Reely Contractor" (routes to the application) — the only inbound funnel.

---

## 2. Club app *(authenticated)*

A Next.js responsive web app, API-first. Left-nav shell: Find Work · Contracts · Time · Messages · Profile · Notifications (bell) · Settings.

**Applicant (un-vetted) state:** the shell loads but is limited to Application Status + a Profile draft. Find Work, bidding, contracts, time, and payout affordances are hidden (not just disabled) until `contractor_identity.status = 'vetted'`.

### 2a. Find Work — job-feed / marketplace browse
- **Route:** `/work` — the v1 "work feed": browsable `listing` rows filtered by `skill_category` (GIN-indexed `category_ids`), budget type, and status `open`.
- Board-originated listings appear here identically to native ones (they arrive via the provider contract).
- **Listing detail** `/work/[listingId]` — the brief, budget, category labels, and the bid affordance.

### 2b. Bidding
- From listing detail: submit a `bid` (rate type, amount, hours estimate, message). Vetting-gated.
- **My bids** `/bids` — the contractor's submitted bids with status (`submitted`/`countered`/`denied`/`accepted`/`withdrawn`); counters open a hire-loop thread.

### 2c. Contract workspace *(the living container)*
- **Route:** `/contracts/[contractId]` — the centerpiece. Renders the `contract` + its expandable `contract_item` list (milestones, scope-adds, deliverables, notes), the time log, the message thread, and the **current billing cycle status**.
- **Billing cycle panel:** shows the weekly cycle state — `open` (accruing), `dispute_window` (with a countdown to `dispute_window_ends_at`), `charged`, or `disputed`. Either party can **raise a dispute during the window**; once raised, the panel shows the open dispute and the charge is held.
- Contracts list `/contracts` — active/paused/completed.

### 2d. Time / timer
- **Route:** `/time` — per-contract logged time; start/stop timer; manual entry; running entry indicator.
- Each stop produces a `time_entry` (`source: timer|extension|manual`). Time is **unbilled until the client approves it** (client approval happens on the counterparty side — Board's hire panel for Board contracts, or the native contract view). The contractor sees approval state per entry.

### 2e. Messaging *(hire-loop only)*
- **Route:** `/messages` + `/messages/[threadId]` — threads scoped to a listing or contract; client↔contractor negotiation, counter/deny discussion. Realtime. General social DMs are staged.

### 2f. Profile editor
- **Route:** `/profile` — edit the marketing + professional fields; toggle `is_public`; set `public_slug`; manage `links` and `category_ids`. System-driven rollups (`contracts_completed`, `hours_logged`) are read-only.

### 2g. Settings / payouts
- **Route:** `/settings` — **Stripe Connect (Express) onboarding** is the key element: the contractor must reach `charges_enabled`/`payouts_enabled` with `kyc_status: verified` before any payout. A persistent banner prompts incomplete onboarding. Browser-extension pairing lives here too.

### 2h. Notifications
- Bell in the shell; `/notifications` full list. Hire-loop + payment/cycle/dispute/vetting events.

---

## 3. Admin console *(single-admin)*

- **Route:** `/admin` — `platform_admin` only.
- **Vetting queue** — `application` rows (`submitted`/`in_review`), each with the applicant's draft profile and a field for the **out-of-system video-call link**; approve/reject with a note. Invite management (`invite` create/track).
- **Ops** — cross-cutting summaries from `report_summary` (vetting, marketplace, contracts, payments); a payments view (cycles, charges, disputes) for oversight.
- **Controller** — report/command/health surface; commands `pause_payments`, `pause_vetting`, `recompute_summary`.
- Admin never silently edits a contractor's contract/financial content; actions are logged to `app_event`.

---

## 4. Browser-extension timer

A lightweight extension client (paired via Settings) that starts/stops the timer against an active contract and writes `time_entry` rows with `source: extension`. It mirrors the club-app timer state and also drives the timer shown in Board's contractor view. Offline ticks reconcile on reconnect (refetch authoritative).

---

## 5. Staged surfaces *(designed-for, not built)*

The **social feed** (posts, follows, likes, replies) and **native Expo mobile** apps land in the staged social phase. v1 leaves nav room and stable User ids so these are additive. Contractor is the portfolio's mobile candidate; native is deliberately deferred rather than splitting v1 effort.

---

## Cross-surface concerns

- **Realtime (scoped):** Supabase Realtime delivers new-bid-on-your-listing and new-message-in-your-thread events, participant-RLS-filtered, delay-tolerant; refetch is authoritative. No presence/cursors in v1.
- **Vetting-gated affordances:** un-vetted Users never see bid/contract/payout controls (hidden, not disabled); enforcement is server-side regardless.
- **Empty / N=1 states:** every surface has a valid empty state — an empty-but-functional work feed, a contractor with zero contracts, a single contractor on the platform. No surface assumes volume or a "first user is special" path (C3).
- **Public-field discipline:** only the safe subset is ever rendered unauthenticated; financial and client data never reach the public profile.
- **Theming:** BrandRef tokens, like every Reely node.
- **Device posture:** v1 responsive web + extension; native staged.

---

## Render strategy
Public profile ISR/SSR (cacheable, SEO-light). Club app + admin SSR behind Clerk. Realtime client subscriptions hydrate after load. Extension runs in its own runtime against the same API.

---

*Frontend surface locked. Next: the API-Security Reference.*
*Confidential — Khaotic Digital, LLC*
