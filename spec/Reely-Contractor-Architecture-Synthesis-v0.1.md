# Reely — Contractor Architecture Synthesis
*v0.1 · prior-context · Khaotic Digital, LLC · 2026-06-05*
*Prior-context input to the AppForge discovery run for the Contractor node — the contractor-side counterpart to the Board synthesis, which forward-declares the marketplace entities this node owns. Inherits `Reely-Identity-Model.md` (does not restate tenancy). **Status: first pass** — the marketplace half and vetting are well-specified; the social club is the thinnest area. Core decisions locked in §6; open questions in §7. Reaches `architecture-locked` once §7 resolves.*

---

## 1. Concept

The Contractor area is a **vetted-only, private club** for contractors — **work-tuned and system-info-driven, but socially interactive**: a deliberately **down-scaled X/Twitter clone** whose feed exists primarily to **push jobs to contractors**, wrapped in enough social mechanics (posts, follows, likes/reactions, replies, DMs) to create dopamine hooks and keep contractors on the app and collaborating. It must **feel hidden and premium** — access is earned, not open. It is explicitly **not** an attempt to compete with social media; the social feature set is intentionally small.

The node carries four things at once: a **job marketplace** (the contractor side of Board's hiring), a **social feed/club**, **marketing profiles**, and **payments** (Stripe Connect).

**Two framing principles (locked):**
- **N=1 must work.** The system has to function gracefully with exactly one contractor. If no second contractor is ever onboarded, that's an acceptable steady state (the founder takes all the work). Nothing — feed, stats, bidding — may *require* contractor critical mass to be coherent.
- **No founder-specific tuning.** Although the founder is the first contractor and is tuning the system around real services, the design itself stays **general** — we do not special-case any one contractor's services into the architecture.

---

## 2. Position in the portfolio (the edges)

- **User-scoped** (per `Reely-Identity-Model.md`): all Contractor data keys to the `User`; **no `tenant_id`**. A contractor is a User, not a tenant.
- **Owns `contractor_identity`** — the verified contractor profile + status layered on the User (resolves the reserved portfolio seam).
- **Owns the marketplace entities Board forward-declares:** `Listing`, `Bid`, `Contract`, `TimeEntry` — Board binds these `deferred → hard` once this node is live.
- **Owns the timer/browser extension** (Board only surfaces a per-project logged-time popup with a report/dispute button).
- **The Board seam:** a `Contract` grants the contractor **contract-granted access** (the identity model's third path) — narrow, stage-limited rights onto specific Board parts. The contractor is **not** a tenant member of the client.
- **Relationship to Stumble:** both are user-scoped social surfaces. `contractor_identity` (this node) and the base User / `reely_consumer_identity` (Stumble) are distinct roles on one User. A person could be both a consumer and a verified contractor on the same account.
- **Catalog:** possible future tie (contractor categories / tooling tags drawn from Catalog taxonomy) — open (§7), not assumed in v1.

---

## 3. Identity & vetting

**`contractor_identity` lifecycle:** `applied | invited` → `in_review` → `approved/active` → (`suspended/revoked`). It is a verified role on the User; approval unlocks the club (feed + social) **and** the ability to bid/be hired.

**Vetting model (locked, v1):**
- **Two entry paths:** a public **"apply" button** (inquiry) and an **invite system** (the founder sends invite emails).
- **Manual review by the founder** (`platform_admin`): confirm the applicant can do what they claim and has experience providing contracting services online, **before** approving access.
- **Video call as the vetting step**, handled **out of system** — the founder pastes a **video-conference link** into the inquiry response or the invite email. The platform does **not** build scheduling/video; it only stores/sends the link.
- **Single-admin vetting in v1** (the founder is the only reviewer). Multi-reviewer / delegated vetting is a V2 reservation.

So the build surface is small: an `Application`/inquiry capture, an `Invite` mechanism (email + signup token), and a `platform_admin` approve/deny console. No automated credential checks.

---

## 4. The marketplace (contractor side of Board hiring)

Mirrors the Board hire flow from the Board synthesis, owning the entities:

- **`Listing`** — created when a client posts a job from a Board part (project/epic/story/task) via the brief-gen agent. Surfaces in the contractor **feed**, filtered to the **contractor's categories**.
- **Feed posting stats** — each job post shows **# submitted proposals, avg proposed working time, avg proposed hourly** (must degrade gracefully at low N — see N=1).
- **`Bid`** — contractor clicks **bid** → popup: a simple **message**, an **hours** amount, an **amount per hour**. The client is notified (in-app + email); the Board part **glows**; the client reads/counters (message / change hours / change hourly) or denies from the Board sidebar. Counter-messaging routes to **DMs**.
- **`Contract`** — on hire: an **expandable living container** of **itemized tasks + time + hourly amount + agreements**. Clients add tasks over time. *"The contract doesn't set the relationship; the contract updates to the relationship."* Hiring grants the contractor board access + notification/email.
- **`TimeEntry`** + **browser extension** — the contractor runs a timer against the contract; time logs against Board task ids (cross-app reference). Board shows a per-project logged-time popup with report/dispute.
- **Payments — Stripe Connect.** Contractors charge clients. Billing cycle: **6pm Sun → 6pm Sun** work week, then a **7-day** client review/dispute window before the system auto-charges. Escrow-vs-direct, fees, and payout timing are open (§7).
- **"Free and open contracting"** — no gating fees; the platform earns its keep by delivering enough value to keep payments on-platform.

---

## 5. The social club (down-scaled X clone)

The thinnest area so far — captured at the level discussed, the rest is §7.

- **Feed** — primary purpose is **getting jobs in front of contractors** (category-filtered listings), interleaved with **contractor posts**.
- **Posts** — contractors author posts; others can **comment/reply**, **like/react** — standard social-feed mechanics, intentionally minimal.
- **Follow** — contractors follow each other.
- **DMs** — direct messaging (also the channel the hire/interview counter-messaging lands in).
- **Marketing profile** — a **simpler-than-Linktree, controllable** page that is **marketing-oriented, not social-oriented**. Likely **publicly shareable** (a contractor's shareable marketing link) even though the club itself is private — confirm in §7.
- **Tone** — dopamine hooks and social stickiness, premium/hidden feel, but a small feature set; not a social-network competitor.

---

## 6. Resolved decisions

- **C1 — User-scoped node.** All data keys to the User; no tenancy. Owns `contractor_identity`.
- **C2 — Vetting:** apply button + invite system → manual founder review with an out-of-system video call (link only) → approve. Single-admin in v1.
- **C3 — N=1 must work; no founder-specific tuning.** Graceful with one contractor; design stays general.
- **C4 — Owns the marketplace entities** Board forward-declares (`Listing`/`Bid`/`Contract`/`TimeEntry`) + the timer/extension; Board surfaces only the time popup + hire sidebar.
- **C5 — Contract is an expandable living container;** Stripe Connect; weekly cycle + 7-day dispute window before auto-charge.
- **C6 — Contract-granted access** is how a contractor reaches client Board parts; never a tenant member.
- **C7 — Social club is a deliberately down-scaled X clone;** feed is job-first; premium/private feel; small feature set.

---

## 7. Open questions for discovery

1. **Social-club scope for v1** — which social mechanics actually ship first (posts? just feed + DMs + follow?), and what's deferred. This is the biggest open area.
2. **Marketing profile** — fields/sections; is it **public/shareable** (likely) while the club stays private? Custom slug? What's "controllable"?
3. **Contractor categories** — where the category taxonomy comes from (own set vs Catalog taxonomy), how listings are categorized, how feed filtering works.
4. **Stripe Connect specifics** — escrow vs direct charge, platform fee model, payout timing, dispute/refund handling within the 7-day window, tax docs (1099/Connect).
5. **Listing → feed mechanics** — how a Board-originated `Listing` reaches the right contractors; ranking; visibility rules; closing a listing on hire.
6. **Feed comments vs board comments** — feed-post comments are user-scoped social (this node / portfolio social-comments service); distinct from tenant-scoped board-item comments. Confirm one shared social-comment system across Stumble/Catalog/feed vs per-node.
7. **DMs scope** — full inbox vs thin interview/hire channel; retention; notifications.
8. **Moderation & trust** — what keeps the club premium post-vetting (reporting, suspension, reviews/ratings of contractors and/or clients?).
9. **Notifications/email matrix** — bid received, hired, message, charge pending, dispute — channels per event.
10. **Realtime** — does the feed/DMs need realtime like Board, or is async fine?

---

## 8. Preliminary module sketch (confirm in discovery)

- **contractor-identity** — application/invite intake, `platform_admin` vetting console (approve/deny, store video link), `contractor_identity` lifecycle.
- **profile** — marketing profile (likely public/shareable), categories/skills.
- **feed** — job-first feed + contractor posts; category filtering; the posting stats (avg time/hourly, #proposals).
- **marketplace** — `Listing`/`Bid` + the bid/counter/deny loop (pairs with Board's hire sidebar); owns the entities Board forward-declares.
- **contracts** — `Contract` (expandable) + itemized tasks + agreements.
- **payments** — Stripe Connect, weekly billing cycle, dispute window, auto-charge.
- **time** — `TimeEntry` + the browser extension; Board surfaces the popup.
- **social** — follow, like/react, reply/comment, DMs (scope per §7).
- **notifications** — bid/hire/message/charge events → in-app + email.
- **contractor-admin** — platform-admin ops + controller integration.

`ai` is light here (mostly the Board-side brief-gen, which is Board's). Realtime is an open swing factor (Q10).

---

## 9. Forward reservations / V2

- **Multi-reviewer / delegated vetting** — v1 is single-admin.
- **Reviews/ratings, richer trust & reputation** — beyond initial vetting.
- **Fuller social feature set** — v1 is down-scaled.
- **Catalog-linked categories/tooling tags** — if not in v1.
- **Realtime feed/DMs** — additive if v1 ships async.

---

*First synthesis pass for the Contractor node. Resolve §7 to reach `architecture-locked`, then run the AppForge pipeline. This node's marketplace entities are the ones the Board synthesis forward-declares; locking them here lets Board's deferred bindings go hard. Inherits `Reely-Identity-Model.md`.*
*Confidential — Khaotic Digital, LLC*
