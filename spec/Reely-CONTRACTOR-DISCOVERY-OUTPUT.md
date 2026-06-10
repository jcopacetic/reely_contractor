# Reely Contractor — Discovery Output
*AppForge · Contractor · v1 work-forward · 2026-06-05*
*Driven by `Reely-Contractor-Architecture-Synthesis-v0.2.md` (architecture-locked, C1–C12). This is the structured discovery pass: the ten sections with the locked decisions mapped in, the v0.2 §7 open items resolved where the synthesis + portfolio context allow, and a short parked list for what remains a genuine later call.*

---

## Classification

**Module model:** `static` — same as every Reely node except Stumble. No runtime module lifecycle; build-time isolation only.

**Identity posture:** **user-scoped** (per `Reely-Identity-Model.md`). Contractor owns `contractor_identity` — a *verified professional profile on the base User*. There is **no `tenant_id`** anywhere in Contractor. Clerk authenticates the User only. This resolves the reserved `contractor_identity` seam: it lives here, on the User, owned by Contractor.

**Portfolio role:** the **provider** of the marketplace shapes Board forward-declares. Contractor **provides** `contractor.listing`, `contractor.bid`, `contractor.contract`, `contractor.time_entry`; Board **consumes** them (currently `deferred`). Running this pipeline is what lets Board's deferred bindings later go hard.

**Scope discipline (C7):** **work-forward.** v1 ships the contract/marketplace machine. The social-network layer (posts, follows, likes, replies, the social feed, general DMs) is **staged** — designed-for, not built. Native mobile (Expo) lands with that staged phase.

---

## 1. Identity & Problem

**What it is:** a vetted-only private club for contractors — "LinkedIn, but people are working, not posturing." A down-scaled, work-tuned X/Twitter clone whose v1 is stripped to the marketplace: find work, bid, get hired, track time, get paid. System-information-driven (real work history, real logged time, real contracts) rather than self-reported résumé theater.

**Problem:** freelance marketplaces optimize for volume and self-promotion; the signal (did this person actually do the work, on time, under contract) is buried. Reely's portfolio already generates *work* (Board projects, BDA strategy) — it needs a trusted supply side that plugs straight into that work via contract-granted access, not a cold external marketplace.

**Core wedge:** vetted membership + system-driven work history + a contract that is a living container, bound directly into the Board hire seam. The contractor's reputation is their actual Reely work record.

**N=1 (C3):** the system must be fully functional with a single contractor and must contain **no founder-specific tuning** — no hard-coded identities, no "first user is special" logic. One contractor browsing an empty-but-valid marketplace is a supported state.

---

## 2. Users & Roles

- **contractor** — a vetted User with a `contractor_identity`. Browses the job-feed, bids, negotiates, signs contracts, runs the timer, gets paid, maintains a public profile. (In Board, this same User appears as the external `contractor` role via a contract-granted grant.)
- **applicant** — a User who has applied (or been invited) but is not yet vetted. Can complete an application and hold a profile draft; cannot bid or contract.
- **client** — *not a first-class Contractor role.* Clients live in Board (tenant members who post jobs). They appear in Contractor only as the counterparty on a Listing/Bid/Contract/message, identified by their Clerk User id. Contractor does not manage client accounts.
- **platform_admin** — single-admin v1 (Jonathan). Runs the vetting queue, ops, controller. (C2)
- **system** — vetting transitions, Stripe webhooks, billing cycle, notifications, realtime fan-out, event emission.

**Vetting lifecycle (C2):** `apply` button **or** `invite` → application submitted → **manual admin review** + an **out-of-system video-call link** (scheduling/calls happen outside Reely v1) → admin `approve`/`reject`. Single admin in v1; the model allows more reviewers later without rework.

---

## 3. Core Modules / Capabilities

v1 modules (10) + one staged:

1. **contractor-identity** — owns `contractor_identity`; the application/invite/vetting state machine; the user-scoped principal extension. Gate for everything else.
2. **profile** — the **public marketing profile** (simpler-than-Linktree, shareable) *and* the in-club professional profile (system-driven work history, skills, logged-hours summary, contract record).
3. **job-feed** — the marketplace discovery surface: browse/filter Listings by skill category; where a Board-posted Listing surfaces. (This is the v1 "feed" — the *work* feed, not a social feed.)
4. **marketplace** — owns `Listing` + `Bid`; post, browse, bid, counter, deny, accept. Listings originate from Board (via the consumed contract) or natively.
5. **contracts** — owns `Contract`, the **expandable living container** (C5); contract lifecycle; the source of the `contract_ref` Board's access-control grants against.
6. **payments** — Stripe Connect (Express); the weekly cycle; **platform-initiated delayed charges** at cycle close after the dispute window; platform take-rate; payouts. **Not escrow.** (C10)
7. **time** — owns `TimeEntry`; the timer + browser extension; per-contract logged time; feeds the weekly charge.
8. **messaging** — **hire-loop DMs only** in v1 (negotiation, counter/deny, client↔contractor on a Listing/Contract). General social DMs are staged.
9. **notifications** — bell + email; bidirectional hire-loop + payment/dispute/cycle events.
10. **contractor-admin** — single-admin vetting console + cross-cutting ops + controller integration.
11. **social** — **STAGED.** posts, follows, likes, replies, the social feed, general DMs; native mobile (Expo) lands here. Forward-reserved, not built in v1.

---

## 4. Data Model (preview — full in the Data-Model Reference)

User-scoped (no `tenant_id`). Key entities:

- `contractor_identity` — verified profile on the User; vetting status; the principal.
- `application`, `invite` — the vetting lifecycle.
- `contractor_profile` — public marketing fields + professional fields; `is_public` for the shareable surface.
- `skill_category` — a **curated, admin-managed vocabulary** (see §10 resolution), not Catalog's taxonomy.
- `listing` — **owned; cross-app consumed by Board.** May carry an external `board_part_ref` when Board-originated.
- `bid` — owned; on a listing.
- `contract` — **owned; cross-app consumed by Board.** The expandable living container.
- `contract_item` — the expandable line entries inside a Contract.
- `time_entry` — **owned; cross-app consumed by Board.** Timer/extension output.
- `message`, `message_thread` — hire-loop messaging.
- `stripe_account` — the contractor's connected (Express) account.
- `charge`, `payout`, `billing_cycle` — the weekly-cycle financial records.
- `dispute` — the dispute-window record.
- `notification` — bell + email.
- *(staged: `post`, `follow`, `like`, `reply`)*
- baseline: `feature_flag`, `app_event`, `report_summary`, `controller_command`.

**Cross-app rule:** Board references Contractor ids (`listing_ref`, `contract_ref`) as opaque references, never FKs/JOINs. The boundary is the contract, not the database.

---

## 5. Surfaces

- **Public marketing profile** — the **one public, unauthenticated, shareable surface** (resolves the v0.2 "profile public?" open item: **yes, public**). Simpler-than-Linktree; SEO-light; the club interior stays private behind it.
- **Club app** (authenticated, responsive web, API-first — C11): job-feed/marketplace, profile editor, contracts, time/timer, messaging, notifications.
- **Admin console** (single-admin): vetting queue, ops, controller.
- **Browser extension** — the time tracker (pairs with the club app; also drives the Board contractor view's timer).
- *(staged: social feed + native Expo mobile apps.)*

**Device posture (C12):** Contractor is the portfolio's **mobile candidate**. v1 is responsive web; native mobile is deliberately deferred to the staged social phase rather than split v1 effort.

---

## 6. Integrations

- **Clerk** — User authentication only (no orgs; user-scoped).
- **Stripe Connect (Express)** — connected accounts = contractors; platform-initiated delayed charges; take-rate; payouts; KYC handled by Stripe. (C10)
- **Supabase** — Postgres + **Realtime** (messaging + bid-arrival; RLS-filtered, delay-tolerant — see §10).
- **Resend** — email (hire-loop, payment/cycle, dispute, vetting decisions).
- **Browser extension** — the timer client.
- **Board** — the consuming node. Contractor is the **provider**; Board calls Contractor for Listing/Bid/Contract/TimeEntry once live.
- **Cloudflare R2** — profile/media assets.

---

## 7. Business Model

**Revenue model = transaction fee**, not subscription. The platform takes a **take-rate** on weekly-billed contract value via Stripe Connect. Membership is **vetted + free** in v1 (the gate is admission, not payment). This is a deliberate divergence from the tenant-SaaS nodes (Catalog/Newsletter/Stumble/BDA/Board) and is recorded as such. Exact take-rate % is parked (flag-gated; not a build blocker).

---

## 8. Constraints

- **Compliance:** GDPR; Stripe-driven KYC/AML on connected accounts; PII in profiles + payment data.
- **Geographies:** US + EU; `dbRegion` us-east-1.
- **Highest-risk property:** the **financial correctness of the delayed-charge cycle** — weekly window (6pm Sun → 6pm Sun), the **7-day dispute window before any platform-initiated auto-charge**, idempotent Stripe webhooks, no double-charge, no charge inside an open dispute. This gets dedicated harness assertions.
- **Second risk:** vetting integrity (no un-vetted User can bid/contract/get paid).
- Realtime is delay-tolerant; refetch is authoritative.

---

## 9. Controller Integration

Enabled; the standard per-node contract (report/command/health/event-push) with `controller_command` + `report_summary` baked in. Push events: `application.submitted`, `contractor.approved`, `listing.posted`, `contract.created`, `payment.charged`, `dispute.opened`. Commands: `pause_payments`, `pause_vetting`, `recompute_summary`.

---

## 10. Open Items — resolved or parked

**Resolved this pass (decisive):**
- **Profile public?** → **Yes.** The marketing profile is the one public/shareable surface; the club interior is private. Resolves the reserved-seam question of where the public face lives.
- **Categories source?** → **Curated, admin-managed skill vocabulary** (`skill_category`). **Not** derived from Catalog's taxonomy — Catalog's taxonomy classifies business/tool types, a different domain from contractor skills. Whether the two ever align is parked, not v1.
- **Listing → feed mechanics?** → In v1 (no social feed) a Listing surfaces in the **job-feed (marketplace browse)**, filtered by skill category. The *social* feed is staged. A Board-posted Listing arrives via the consumed contract and appears in the job-feed like any native listing.
- **Moderation?** → v1 = **admit-time vetting + admin removal**; a lightweight report flag routes to the single-admin queue. No automated moderation in v1.
- **Notifications?** → bell + email; bidirectional hire-loop; plus payment/cycle/dispute/vetting events.
- **Realtime?** → **Yes, scoped.** Supabase Realtime for **messaging + bid arrival**, RLS-filtered and delay-tolerant — the same furniture Board establishes; the hire negotiation loop is genuinely interactive. Richer realtime (presence, social) is staged. *(Claude's call per C-series latitude; overridable.)*
- **Stripe specifics?** → Stripe Connect **Express**; platform charges the client's saved method and transfers to the contractor minus the take-rate (destination/separate charges); weekly cycle; delayed charge after the dispute window; **not escrow.** Exact fee % parked.

**Parked (genuine later calls, none block the build):**
- Take-rate % and any tiering.
- Whether `skill_category` ever reconciles with Catalog taxonomy.
- Full social-phase detail (feed ranking, follow graph, native-mobile specifics) — staged.
- Out-of-system video-call tooling choice (manual link in v1).

---

## C1–C12 Decision Map

| # | Decision | Where it lands |
|---|---|---|
| C1 | User-scoped; owns `contractor_identity` | Classification; §2; §4 |
| C2 | Vetting: apply/invite → manual review + video link → approve; single-admin | §2; contractor-identity + contractor-admin modules |
| C3 | N=1 must work; no founder-specific tuning | §1 |
| C4 | Owns Listing/Bid/Contract/TimeEntry + timer/extension | §3; §4; portfolio provider role |
| C5 | Contract = expandable living container | contracts module; `contract_item` |
| C6 | Contract-granted access bridge | `contract_ref` consumed by Board access-control |
| C7 | Work-forward v1; social staged | Scope discipline; social module STAGED |
| C8 | (synthesis) vetted-club identity / system-driven profile | §1; profile module |
| C9 | (synthesis) marketplace = job-feed + listing/bid | job-feed + marketplace modules |
| C10 | Payments: Stripe Connect, delayed platform-initiated charge, dispute window, not escrow | payments module; §7; §8 |
| C11 | Surfaces: v1 responsive web API-first; native Expo in social phase | §5 |
| C12 | Device posture per node; Contractor = mobile candidate | §5 |

---

*Discovery locked. Next pipeline step: the Technical Proposal.*
*Confidential — Khaotic Digital, LLC*
