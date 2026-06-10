# Contractor — LLM Context Profile
*AppForge · Contractor · v1 work-forward · 2026-06-05*
*The single consolidated feed for each isolated module build session. Carries enough to build against; the Data-Model, Frontend-Surface, API-Security, and Module-Contract specs remain authoritative on detail.*

---

## 1. Identity & scope
Reely Contractor — a vetted-only contractor club; "LinkedIn but people are working, not posturing." v1 is **work-forward**: marketplace, contracts, time, payments ship; the social layer (feed/posts/follows/likes/replies/general DMs) and native Expo mobile are **staged**. The defining problem is the **financial correctness of a delayed, platform-initiated weekly billing cycle** over Stripe Connect. Domain `contractor.reely.io`; portfolio node `contractor`.

## 2. Module model & identity posture
`static` module model — build-time isolation, no runtime lifecycle. **User-scoped**: `contractor_identity` is a verified professional profile on the base User (Clerk auth only — no orgs, no tenants). There is **no `tenant_id` anywhere**. This node *realizes* the reserved `contractor_identity` seam and is the *provider* of the marketplace shapes Board consumes.

## 3. Stack
Next.js · Clerk (auth only) · Fastify/tRPC · Supabase Postgres + **Supabase Realtime** (scoped) · Prisma · BullMQ (Railway worker) · Upstash Redis · **Stripe Connect (Express)** · Resend · Cloudflare R2 · Turborepo · Vercel · Sentry · PostHog. AI: not core (no scaffolder/engine). Browser extension for the timer.

## 4. Roles & principals
`contractor` (vetted User) · `applicant` (un-vetted; limited shell) · `platform_admin` (single-admin v1) · `system`. **Client is not a Contractor role** — clients live in Board and appear only as an opaque Clerk User id on two-party entities.

## 5. Access model (five shapes, no tenant)
- **User-scoped** (`owner_user_id = auth.uid()`): identity, private profile, own time, stripe_account, notifications.
- **Participant-scoped** (caller ∈ parties): listing, bid, contract(+items), message_thread/message, billing_cycle/charge/payout/dispute.
- **Public**: `contractor_profile` safe subset when `is_public`; non-public slug → 404.
- **Admin**: vetting, ops, report_summary, controller_command, feature_flag.
- **Provider (server-to-server)**: Board calls via `CONTRACTOR_SERVICE_KEY`, resource-scoped, never list-all.
**Vetting hard-gate:** every privileged write re-checks `status = 'vetted'`.

## 6. ModuleContext (`ctx`)
Baseline `db/events/queue/flags/error` plus: `ctx.db` (user + participant RLS helpers; `asUser`, `partyOf`), `ctx.identity` (`{userId, vettingStatus}`, `requireVetted()`), `ctx.stripe` (Connect: account link, status, `createCharge({idempotencyKey})`, transfer/payout, `verifyWebhook`), `ctx.realtime` (participant-RLS-filtered; bids + messages; delay-tolerant), `ctx.comms` (Resend), `ctx.providerAuth` (verify service key + resource scope), `ctx.queue` (billing-cycle worker, reconciliation, vetting effects). **Absent:** `ctx.tree`, `ctx.tenant`, `ctx.scaffold`, `ctx.access`.

## 7. Data model (21 v1 tables + 4 staged)
Principal/vetting: `contractor_identity`, `application`, `invite`. Profile: `contractor_profile` (is_public, public_slug, category_ids GIN, system rollups), `skill_category` (curated, admin). Marketplace: `listing` *(provided; board_part_ref)*, `bid`. Contracts: `contract` *(provided; the contract_ref Board grants against; board_ref)*, `contract_item`. Time: `time_entry` *(provided; approved gates billing)*. Messaging: `message_thread`, `message`. Payments: `stripe_account`, `billing_cycle` (unique contract+period_start), `charge` (unique cycle; idempotency_key), `payout`, `dispute`. Baseline: `feature_flag`, `app_event`, `report_summary`, `controller_command`. Staged: `post`, `follow`, `like`, `reply`. **Cross-app ids are references, never FKs.**

## 8. Surfaces
Public marketing profile (`/c/[slug]`, the one public surface, safe subset, link-only) · club app (Next.js SSR behind Clerk: `/work` job-feed, listing detail + bid, `/bids`, `/contracts/[id]` workspace with billing-cycle panel + dispute countdown, `/time` timer, `/messages`, `/profile`, `/settings` Stripe onboarding, notifications) · admin console (`/admin`: vetting queue with video-call link, ops, controller) · browser-extension timer · staged: social feed + native Expo. Applicant state = limited shell (application status + profile draft). Every surface has a valid empty/N=1 state.

## 9. Provider surface (Board ↔ Contractor)
**Board → Contractor** (`/provider/*`, service key, resource-scoped): `POST /provider/listings` (create), `GET /provider/listings/{id}/bids`, `POST /provider/contracts` (hire), `GET /provider/contracts/{id}` (+items), `GET /provider/contracts/{id}/time-entries`, `POST /provider/time-entries/{id}/approve`. That is the entire cross-app write/read surface. **Contractor-person → Board** is the opposite direction, governed by Board's `access-control` grant on `contract_ref` — nothing in this node.

## 10. Financial-correctness guards (worker + API)
1. One `billing_cycle` per `(contract_id, period_start)`. 2. Charge only on `dispute_window → charged`, `now > dispute_window_ends_at`, no `open` dispute. 3. Idempotent charge (`idempotency_key` + unique `billing_cycle_id`); Stripe webhook idempotent on event id; signature-verified. 4. Only `approved` time bills. 5. `take_rate` computed at close, stored on cycle + charge; `net = gross − take_rate`. 6. Payout only after charge `succeeded`. Cycle = weekly 6pm Sun → 6pm Sun; 7-day dispute window. **Not escrow.**

## 11. Harness assertion catalog
Isolation: `user-scope-isolation`, `participant-scope-isolation`, `public-field-discipline`. Vetting: `vetting-gate`. Provider: `provider-scope`, `cross-app-reference-integrity`. Financial: `one-cycle-per-week`, `no-charge-in-dispute`, `no-charge-before-window`, `idempotent-charge`, `approved-time-only`, `take-rate-stored`, `payout-after-success`, `n1-cycle`. Webhook: `webhook-signature`, `webhook-idempotency`. Realtime: `realtime-rls`. Model: `static-model` (no tenant_id anywhere).

## 12. Portfolio contracts & controller
**Provides:** `contractor.listing`, `contractor.bid`, `contractor.contract`, `contractor.time_entry` (Board consumes, currently `deferred`; flips hard when Contractor is live). **Consumes:** none for v1. **Realizes:** `contractor_identity`. **Controller:** enabled; report/command/health/event-push; `controller_command` + `report_summary`. Push: `application.submitted`, `contractor.approved`, `listing.posted`, `contract.created`, `payment.charged`, `dispute.opened`. Commands: `pause_payments`, `pause_vetting`, `recompute_summary`.

## 13. Build order & open items
**Build order:** contractor-identity → profile → marketplace → job-feed → contracts → time → payments → messaging → notifications → contractor-admin; social staged.
**Open (non-blocking):** take-rate % + tiering (flag-gated); skill_category ↔ Catalog reconciliation (parked); social-phase detail + native-mobile (staged); video-call tooling (manual link v1); Board hard-binding flips only once Contractor is live.

---

*Context profile locked. Next: the module specs (10 v1), then `contractor.manifest.json`.*
*Confidential — Khaotic Digital, LLC*
