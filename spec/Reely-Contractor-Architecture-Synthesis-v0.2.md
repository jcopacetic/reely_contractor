# Reely — Contractor Architecture Synthesis
*v0.2 · prior-context · Khaotic Digital, LLC · 2026-06-05*
*Supersedes v0.1. **Status: architecture-locked for v1 (work-forward).** v1 ships the contract/marketplace machinery; the social-network layer and mobile-native apps are staged to a named next phase (§5, §9). Two consequential calls (payments model, mobile surface) are made here as my recommendations — flag if either is wrong. Inherits `Reely-Identity-Model.md`. The marketplace entities this node owns are the ones the Board synthesis forward-declares.*

> **v0.2 changes:** Scoped v1 to **work-forward** — contract interaction functions IN, social-network layer **staged** (C8). Added the **"LinkedIn, but working" north star** (C9). Made two architecture calls: **payments = platform-initiated delayed Stripe Connect charges after the dispute window** (C10), and **v1 = responsive web, mobile-native Expo apps in the staged phase** (C11). Recorded the **per-node device posture** (C12).

---

## 1. Concept

The Contractor area is a **vetted-only, private club** for contractors — **work-tuned and system-info-driven**. The north star as it matures: **"LinkedIn, but people are working instead of posturing"** — purposeful, not pretentious; a place with actual work-throughput rather than performative content. v1 earns that by being useful for *work* first; the social skin comes later.

The node carries four things over its life: a **job marketplace** (the contractor side of Board's hiring), **payments** (Stripe Connect), **marketing profiles**, and — staged — a **social club**.

**Framing principles (locked):**
- **N=1 must work.** The system functions gracefully with exactly one contractor; no feature requires contractor critical mass. If no second contractor is ever onboarded, that's an acceptable steady state.
- **No founder-specific tuning.** The founder is the first contractor and tunes around real services, but the architecture stays general — no one contractor's services are special-cased in.
- **Work-forward v1.** Ship the machinery that does work (contracts, bidding, payments, time, the categorized job feed, the hireable profile) before the machinery that entertains (the social network).

---

## 2. Position in the portfolio (the edges)

- **User-scoped** (per `Reely-Identity-Model.md`): all data keys to the `User`; **no `tenant_id`**.
- **Owns `contractor_identity`** — the verified contractor profile + status on the User (resolves the reserved portfolio seam).
- **Owns the marketplace entities Board forward-declares:** `Listing`, `Bid`, `Contract`, `TimeEntry`. Because these are **v1 here**, Board's deferred bindings can go hard once this node is live.
- **Owns the timer/browser extension** (Board only surfaces a per-project logged-time popup with report/dispute).
- **Board seam:** a `Contract` grants **contract-granted access** (identity model's third path) — narrow, stage-limited rights onto specific Board parts. The contractor is **not** a tenant member.
- **Stumble:** both user-scoped social surfaces; `contractor_identity` and the base User are distinct roles on one User.
- **Catalog:** possible future tie (contractor categories / tooling tags from Catalog taxonomy) — open, not assumed in v1.

---

## 3. Identity & vetting (v1)

**`contractor_identity` lifecycle:** `applied | invited` → `in_review` → `approved/active` → (`suspended/revoked`). Approval unlocks bidding/being-hired now, and the social club in the staged phase.

**Vetting model (locked, v1):** an **"apply" button** (inquiry) + an **invite system** (founder sends invite emails) → **manual review by the founder** (`platform_admin`) → approve. The vetting **video call is out-of-system** (the founder pastes a conference link into the inquiry reply or invite email; the platform stores/sends the link, builds no scheduling/video). **Single-admin in v1.** Build surface: `Application`/inquiry capture, `Invite` (email + signup token), a `platform_admin` approve/deny console.

---

## 4. The marketplace + payments (v1 core)

Owns the contractor side of the Board hire flow:

- **`Listing`** — created when a client posts a job from a Board part via the brief-gen agent; surfaces in the contractor **job feed**, filtered to the contractor's **categories**. In v1 the feed is a **categorized job list/board, not a social feed.**
- **Feed posting stats** — each post shows **# proposals, avg proposed working time, avg proposed hourly** (must degrade gracefully at N=1).
- **`Bid`** — bid popup: a simple **message**, **hours**, **amount per hour**. Client notified (in-app + email); the Board part **glows**; client reads/counters (message / change hours / change hourly) or denies from the Board sidebar. Counter-messaging uses the **hire-loop message channel** (a thin DM scoped to hiring/interview in v1 — the general social DM inbox is staged).
- **`Contract`** — on hire: an **expandable living container** of **itemized tasks + time + hourly + agreements**; clients add tasks over time. *"The contract doesn't set the relationship; it updates to the relationship."* Hire grants board access + notification/email.
- **`TimeEntry`** + **browser extension** — timer runs against the contract; logs against Board task ids (cross-app reference). Board shows a per-project logged-time popup with report/dispute.
- **Payments — Stripe Connect (C10, my call):** **platform-initiated, delayed charges.** Time accrues across the **6pm Sun → 6pm Sun** week; the cycle closes; the client gets a **7-day review/dispute window**; then **the system charges the client** (destination charge — contractor is the connected account, platform takes its cut as the application fee) and pays the contractor. This matches "charged by the system" + dispute-before-charge — *not* pre-charge-then-refund, *not* funds held in escrow. Override if you intended escrow.
- **Marketing profile (v1):** a **simpler-than-Linktree, controllable, marketing-oriented** page — needed in v1 because a contractor must be presentable/hireable. Likely **public/shareable** (a link you hand to clients) even though the club is private (confirm, §7).

---

## 5. The social club (STAGED — next phase)

Deferred out of v1 per the work-forward call. The reserved layer, to be given its own synthesis pass when it's time:

- A **social feed** (contractor posts interleaved with jobs), **follows**, **likes/reactions**, **replies/social comments**, a **general DM inbox**, dopamine/stickiness mechanics — the down-scaled X/LinkedIn-style network.
- This is the layer that most wants **mobile-native** (C11) — so the social phase and the Expo apps land together as the "LinkedIn-but-working" build.
- Deliberately small even when it ships: not a social-media competitor.

v1 retains only the **job feed (as a job list)** and the **hire-loop message channel** — the minimum the work flow needs. Everything social-network is staged.

---

## 5b. Surfaces & mobile (C11, my call)

- **v1 = responsive web** on the AppForge Next.js stack, built **API-first** so a later native client consumes the same backend.
- **Mobile-native (Expo / React Native) is the planned surface for the staged social phase** — not v1. Rationale: mobile-native matters most once the LinkedIn-but-working social layer exists; pairing them keeps v1 lean and lets the native build target a known, fuller surface. Override if you want native in v1.
- **Per-node device posture (C12, portfolio observation):** Contractor = mobile candidate (native, staged phase); **BDA + Board = desktop web**, not mobile candidates; **Catalog + Stumble = browser, SEO/search-oriented**. Worth recording at portfolio level so each node's surface targets are explicit.

---

## 6. Resolved decisions

C1–C7 from v0.1 stand (user-scoped; vetting; N=1 + no founder-tuning; owns marketplace entities + timer; expandable Contract + weekly cycle; contract-granted access; social is down-scaled). Added in v0.2:

- **C8 — Work-forward v1:** contract/marketplace functions ship in v1; the social-network layer is staged.
- **C9 — North star:** "LinkedIn, but working, not posturing" — purposeful, anti-pretentious; guides the staged phase.
- **C10 — Payments (my call):** Stripe Connect, platform-initiated delayed charges at cycle close after the 7-day dispute window (destination charges; platform application fee). Not escrow, not pre-charge/refund.
- **C11 — Surfaces (my call):** v1 responsive web, API-first; mobile-native Expo apps in the staged social phase.
- **C12 — Device posture (observation):** Contractor mobile-candidate; BDA/Board desktop web; Catalog/Stumble browser/SEO.

---

## 7. Discovery will finalize (bounded)

- **Stripe Connect specifics** within C10: platform fee %, payout timing, refund/partial-dispute mechanics inside the window, tax/1099 + Connect onboarding.
- **Category taxonomy** source (own set vs Catalog taxonomy) + how listings are categorized + feed filtering.
- **Listing → feed mechanics:** targeting, visibility rules, close-on-hire.
- **Profile** public/shareable confirm, custom slug, exact sections, what "controllable" means.
- **Moderation/trust** beyond vetting: reporting, suspension, ratings of contractors/clients.
- **Notification/email matrix:** bid received, hired, message, charge pending, dispute.
- **Realtime** for the work surfaces — likely async is fine in v1 (the live board lives on the Board node); confirm.

---

## 8. Preliminary module sketch (v1 unless noted)

- **contractor-identity** — application/invite intake, `platform_admin` vetting console, lifecycle.
- **profile** — marketing profile (likely public), categories/skills.
- **job-feed** — categorized job list + posting stats; *(social feed layer → staged)*.
- **marketplace** — `Listing`/`Bid` + bid/counter/deny loop; owns the Board-forward-declared entities.
- **contracts** — `Contract` (expandable) + itemized tasks + agreements.
- **payments** — Stripe Connect, weekly cycle, dispute window, platform-initiated charge.
- **time** — `TimeEntry` + browser extension; Board surfaces the popup.
- **messaging** — hire-loop channel in v1; *(general DM inbox → staged)*.
- **notifications** — bid/hire/message/charge events → in-app + email.
- **social** — *(STAGED: posts/follows/likes/replies/feed-social)*.
- **contractor-admin** — platform-admin ops + controller integration.

`ai` is light here. Realtime likely unneeded in v1 work surfaces.

---

## 9. Forward reservations / next phase

- **The social club + mobile-native (Expo) apps** — the named "LinkedIn-but-working" phase; gets its own synthesis pass.
- **Multi-reviewer / delegated vetting** — v1 is single-admin.
- **Reviews/ratings, richer trust & reputation.**
- **Catalog-linked categories/tooling tags.**
- **Escrow option** — if the platform-initiated-charge model ever needs held funds.

---

*Architecture-locked for v1 (work-forward). Next: run the AppForge pipeline for Contractor (v1 scope), which locks the marketplace entity shapes and lets Board's deferred bindings go hard. The staged social + mobile phase gets its own synthesis when it's time. Inherits `Reely-Identity-Model.md`.*
*Confidential — Khaotic Digital, LLC*
