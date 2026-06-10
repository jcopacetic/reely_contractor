# Reely Contractor — Technical Proposal
*AppForge · Contractor · v1 work-forward · 2026-06-05 · v1*
*Translates `Reely-CONTRACTOR-DISCOVERY-OUTPUT.md` into architecture + module breakdown. Architecture-locked inputs: synthesis v0.2 (C1–C12), `Reely-Identity-Model.md`, `PORTFOLIO-CONTRACT.md`.*

---

## 1. Overview

Contractor is the supply side of the Reely portfolio: a vetted-only club where work history is system-generated, the contract is a living container, and the whole machine plugs into the Board hire seam through build-time contracts. v1 is **work-forward** — the marketplace, contracts, time, and payments ship; the social network (feed, follows, posts, general DMs) and native mobile are **staged**. The defining engineering problem is not the social graph; it is the **financial correctness of a delayed, platform-initiated billing cycle** with a dispute window, running over Stripe Connect.

The node is `static`, **user-scoped** (no `tenant_id`), Clerk-authenticated, and it is the **provider** of `contractor.listing`, `contractor.bid`, `contractor.contract`, and `contractor.time_entry` — the shapes Board currently consumes `deferred`.

---

## 2. Module Model & Architecture Posture

- **Module model:** `static`. Build-time isolation via typed module contracts + harnesses; no runtime module lifecycle.
- **Identity:** user-scoped. `contractor_identity` is a verified professional profile **on the base User**. Clerk authenticates the User only — no organizations, no tenants. This is the home of the reserved `contractor_identity` seam.
- **Two integration directions with Board:**
  1. **Board → Contractor (server-to-server):** Board posts Listings, reads Bids, creates Contracts, and reads TimeEntries by calling Contractor's *provider* endpoints with a service credential, scoped to the specific resource.
  2. **Contractor person → Board (contract-granted):** the same human, holding a Clerk session, reaches into Board's tenant data through Board's `access-control` grant keyed on `contract_ref`. Contractor never holds tenant data; Board never holds marketplace data. The contract is the boundary.
- **Realtime:** Supabase Realtime, scoped to messaging + bid arrival, RLS-filtered by participant, delay-tolerant. Refetch is authoritative.

---

## 3. Module Breakdown

**v1 (10):**

1. **contractor-identity** — the application/invite → manual-review → approve state machine; owns `contractor_identity`; the vetting gate that every privileged action checks. Foundational.
2. **profile** — the public marketing profile (the one public surface) + the in-club professional profile (system-driven: contracts completed, hours logged, categories).
3. **marketplace** — owns `Listing` + `Bid`; post / browse-source / bid / counter / deny / accept. Listings arrive natively or from Board via the provider contract.
4. **job-feed** — the discovery surface over Listings: filter by `skill_category`; the v1 "work feed."
5. **contracts** — owns `Contract` (the expandable living container) + `ContractItem`; the lifecycle and the `contract_ref` source Board grants against. Exposes the Board-callable provider create/read endpoints.
6. **time** — owns `TimeEntry`; the timer + browser extension; per-contract logged time that feeds the weekly charge.
7. **payments** — Stripe Connect (Express); the weekly cycle, the dispute window, the delayed platform-initiated charge, the take-rate, payouts. The financial-correctness core. Not escrow.
8. **messaging** — hire-loop DMs only in v1 (negotiation, counter/deny, client↔contractor on a Listing/Contract).
9. **notifications** — bell + email; bidirectional; hire-loop + payment/cycle/dispute/vetting events.
10. **contractor-admin** — single-admin vetting console + cross-cutting ops + controller integration.

**Staged (1):**
11. **social** — posts, follows, likes, replies, social feed, general DMs; native Expo mobile lands here. Forward-reserved.

**Build order:** contractor-identity → profile → marketplace → job-feed → contracts → time → payments → messaging → notifications → contractor-admin. (social deferred.)

---

## 4. Data Model Overview

User-scoped; participant-scoped for two-party entities. Headline tables (full detail in the Data-Model Reference):

- **Principal/vetting:** `contractor_identity`, `application`, `invite`.
- **Profile:** `contractor_profile` (with `is_public`), `skill_category` (curated, admin-managed).
- **Marketplace:** `listing` *(provided)*, `bid`.
- **Contracts:** `contract` *(provided)*, `contract_item`.
- **Time:** `time_entry` *(provided)*.
- **Messaging:** `message_thread`, `message`.
- **Payments:** `stripe_account`, `billing_cycle`, `charge`, `payout`, `dispute`.
- **Baseline:** `feature_flag`, `app_event`, `report_summary`, `controller_command`.
- **Staged:** `post`, `follow`, `like`, `reply`.

**Cross-app references:** `listing.board_part_ref` and any `contract.board_ref` are opaque Board ids — references, never FKs. Board's `listing_ref`/`contract_ref` point back the same way.

---

## 5. Surfaces & Frontend

- **Public marketing profile** — unauthenticated, shareable, SEO-light; simpler-than-Linktree; the only public surface.
- **Club app** — authenticated, responsive web, API-first (Next.js): job-feed/marketplace, profile editor, contracts, time/timer, messaging, notifications.
- **Admin console** — single-admin: vetting queue, ops, controller.
- **Browser extension** — the timer client; also serves the Board contractor-view timer.
- **Staged:** social feed + native Expo mobile.

Device posture: v1 responsive web; Contractor is the portfolio's mobile candidate, with native deferred to the staged phase rather than splitting v1 effort.

---

## 6. Integrations

- **Clerk** — User auth only.
- **Stripe Connect (Express)** — connected accounts = contractors; platform charges client method, transfers minus take-rate; KYC via Stripe; idempotent webhooks.
- **Supabase** — Postgres + Realtime (messaging, bid arrival).
- **Resend** — email.
- **Browser extension** — timer.
- **Board** — the consuming node; Contractor is the provider.
- **Cloudflare R2** — profile/media assets.

---

## 7. Security & Access Model

Four access shapes, all without `tenant_id`:

- **User-scoped:** personal data — `contractor_identity`, `contractor_profile` (private fields), `time_entry`, `stripe_account`, notifications. RLS `user_id = auth.uid()`.
- **Participant-scoped:** two-party data — `listing` (owner + browsable-by-vetted), `bid` (bidder + listing owner), `contract`/`contract_item` (the two parties), `message`/`message_thread` (thread participants). RLS checks party membership.
- **Public:** the marketing profile (`is_public`), unauthenticated read of a safe field subset.
- **Admin:** vetting, ops, cross-cutting reads. `platform_admin` only.
- **Provider (server-to-server):** Board's calls authorized by `CONTRACTOR_SERVICE_KEY`, scoped to the named resource (a listing, a contract, that contract's time entries) — never a blanket data export.

**Vetting is a hard gate:** no un-vetted User can bid, contract, or be paid. Enforced in `contractor-identity` and re-checked at each privileged endpoint.

---

## 8. Background Jobs, Async & Realtime

- **Billing cycle worker** — runs the weekly close (6pm Sun → 6pm Sun); for each contract, sums approved `time_entry`, opens the **7-day dispute window**, and only after it closes (no open dispute) issues the **platform-initiated delayed charge** via Stripe; records `charge` + `payout`. Idempotent per `(contract, cycle)`.
- **Stripe webhook handler** — idempotent on Stripe event id; reconciles `charge`/`payout`/account status; never double-charges.
- **Vetting transitions** — application/invite/approve side effects (email, identity flip).
- **Realtime** — Supabase Realtime for new bids on your listing and new messages in your thread; participant-RLS-filtered; delay-tolerant.
- **Brief/listing intake** — accept a Board-posted listing through the provider endpoint and surface it in the job-feed.

The dispute window + delayed charge + idempotent webhooks are the **highest-risk path** and get dedicated harness assertions (no charge inside an open dispute; no double-charge; no charge for un-approved time; N=1 cycle runs cleanly).

---

## 9. Business Model & Monetization

**Transaction fee**, not subscription. The platform take-rate is applied to weekly-billed contract value through Stripe Connect. Membership is **vetted + free** in v1. Exact take-rate % is flag-gated and parked — not a build blocker. This is a deliberate, documented divergence from the tenant-SaaS nodes (recorded as a `_schemaAdaptation` on `businessModel`).

---

## 10. Constraints, Compliance & Risk

- **Compliance:** GDPR; Stripe KYC/AML on connected accounts; PII in profiles + payments.
- **Geographies:** US + EU; `dbRegion` us-east-1.
- **Risk ranking:** (1) billing-cycle financial correctness; (2) vetting integrity; (3) provider-endpoint scoping (no over-broad cross-app reads); (4) public-profile field leakage (only safe fields public).
- Realtime delay-tolerant; refetch authoritative.

---

## 11. Portfolio Contracts & Controller

**Provides** (Board consumes, currently `deferred`): `contractor.listing`, `contractor.bid`, `contractor.contract`, `contractor.time_entry`. When Contractor goes live, Board's deferred bindings can flip hard.

**Consumes:** none required for v1 (Board is the consumer of Contractor, not the reverse). Client identity arrives as an opaque Clerk User id on two-party entities.

**Realizes:** the reserved `contractor_identity` seam.

**Controller:** enabled; per-node report/command/health/event-push with `controller_command` + `report_summary`. Push events: `application.submitted`, `contractor.approved`, `listing.posted`, `contract.created`, `payment.charged`, `dispute.opened`. Commands: `pause_payments`, `pause_vetting`, `recompute_summary`.

---

## 12. Build Plan & Open Items

**Build order:** contractor-identity → profile → marketplace → job-feed → contracts → time → payments → messaging → notifications → contractor-admin; social staged.

**Scaffold targets (preview):** monorepo (web, api, worker), `packages/{types, contracts, db, ui, config, operations}`, Prisma schema, Clerk middleware, Stripe webhook route, billing-cycle worker, realtime channel, controller module.

**Open items (non-blocking):**
- Take-rate % + any tiering (flag-gated).
- Whether `skill_category` ever reconciles with Catalog taxonomy.
- Social-phase detail (feed ranking, follow graph, native-mobile specifics) — staged.
- Out-of-system video-call tooling (manual link in v1).
- Board hard-binding flips only once Contractor is provisioned/live.

---

*Proposal locked. Next: the three reference docs (Data-Model, Frontend-Surface, API-Security).*
*Confidential — Khaotic Digital, LLC*
