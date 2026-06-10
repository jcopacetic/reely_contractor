# Reely · Contractor — Build Instructions (AppForge)

*Node slug `contractor`. Built per `reely/BUILD-PROTOCOL.md`. This file sits at the repo root and is read
every session. The node's manifest + module specs live under `spec/` (copied from `reely/06-Contractor/`).*

## What it is
A **vetted-only contractor club + work marketplace**. Contractors apply → an admin approves → they onboard
(linktree-style public profile, official info, signed docs, skill categories) → they get a **social club**
(feed, posts with image/video, follows, reactions/comments, achievements/XP, DMs) and a **work loop**
(job-feed → bids → contracts → time → Stripe payments). The work loop plugs straight into **Board** via
the `contractor.*` provider contracts Board already consumes (its `hiring-bridge` + deferred client).

## Canonical sources (priority order)
1. `spec/contractor.manifest.json` — **AUTHORITATIVE** structured truth (stack, roles, modules, tables, RLS,
   contracts). When code and manifest disagree, the manifest wins.
2. `spec/*.spec.md` — module specs + the data-model / API-security / frontend-surface references.

## BUILD ORDER — social-club FIRST (recorded deviation)
The manifest ships the **work-loop first** and stages the **social club** for v2. Per the owner's decision we
build **social-club first**. Foundation (identity, profile, admin) is shared and comes first either way.
- **Phase 0 (done first):** scaffold · foundation+social schema + RLS · routing/gating.
- **Phase 1 (social):** contractor-identity → profile/onboarding → posts · feed · social-graph(follows) ·
  community(reactions/comments) · achievements/XP · social DMs → notifications. The 6 surfaces; jobs/contracts/
  financial are stubs until Phase 2. The staged social modules are AUTHORED here by lifting **Stumble's**
  patterns (community reactions/comments, follow model+RLS, feed_event, gamification, profile pages,
  `toolbar.tsx`/`pulse-panel.tsx`).
- **Phase 2 (work-loop, per the manifest, no deviation):** marketplace → job-feed → contracts → time (+ the
  browser extension) → payments (Stripe Connect Express, weekly cycle) → hire-loop messaging → contractor-admin.
  Then wire **Board** (flip `board/apps/api/src/clients/contractor.ts` stub → real; build the "hire for this"
  panel + applicant/contract/time/finance surfaces in Board).

## Model: static + **USER-SCOPED (NO tenant)**
- `moduleModel: static`. No runtime disable/unmount lifecycle. Async work is enqueue → progress → refetch.
- **NO tenant.** `contractor_identity` is a verified layer on the base Clerk User (Reely-Identity-Model). Access
  is **user-scoped + participant-scoped**. RLS keys on per-request GUCs set by `withUser` (`@contractor/db`):
  `app.actor_user` (Clerk user id) + `app.actor` (role: contractor | applicant | platform_admin | system).
  Policy bodies in `packages/db/prisma/rls.sql` (baseline; each module session hardens its own).
- **The vetting gate** is `contractor_identity.status` (applicant → vetted → suspended). Every privileged write
  checks `ctx.identity.requireVetted()`. On approve, the api also **mirrors the role to Clerk**
  (`publicMetadata.role='contractor'`) so the marketing "Contractor" nav link + `/contractor/*` middleware can
  gate cheaply; on suspend it clears it. The DB status stays authoritative for writes.
- **Clients are not a Contractor role.** They appear only as opaque Clerk User ids on two-party entities
  (listing/bid/contract/thread). Board members hire; they never get a contractor profile.

## Access gating (hard requirement)
- `/contractor/apply` + `/contractor/status` → any signed-in user (applicant flow).
- `/contractor/**` (the app: dashboard/feed/dms/profile/…) → Clerk role `contractor` ONLY (middleware redirect).
- `/c/[slug]` → public marketing profile (safe-subset, only when `is_public`); non-public slug 404s.
- The "Contractor" nav entry is shown ONLY when `role==='contractor'` (mirror the `strategy-nav-link.tsx` pattern).

## Hard rules
- Stay inside the active module's boundary. The manifest defines tables/roles/contracts — generate handler
  bodies, component JSX, and RLS policy bodies, not new tables/roles/contracts (social tables are the one
  recorded exception, authored in Phase 1 from Stumble's models).
- **Never write Board** — `board_part_ref` / `board_ref` / `listing_ref` are opaque cross-app references, never
  FKs/JOINs. Provider endpoints (`/provider/*`) are service-key + resource-scoped (never an unscoped collection).
- Only **approved** time bills. Charges are platform-initiated after the dispute window (not escrow); the
  Stripe webhook is signature-verified + idempotent and never initiates a charge.
- Emit only declared events with an actor; user/participant isolation is the top correctness property.

## Stack (manifest.stack.resolved)
turborepo · pnpm · next.js · trpc · zod · shadcn+tailwind · zustand · tanstack-query · fastify · clerk ·
prisma · supabase-realtime · bullmq · upstash-redis · resend · **stripe-connect-express** · cloudflare-r2 ·
railway (api/worker) · vercel (web) · supabase-postgres · sentry · posthog · axiom. No AI. **Browser extension**
(timer) is a separate codebase.

## Local dev (local-first; prod-rigged via env)
- `pnpm install` then `pnpm infra:up` (docker Postgres `contractor` :5436 + Redis :6383).
- `pnpm --filter @contractor/db migrate` then `… rls` then `… seed`. Clerk unset locally → a dev session powers
  the loop; Resend/R2/Stripe/Supabase clients no-op/stub when keys are unset.

## Definition of done (per module)
Static harness assertions green (user-scope-isolation, vetting-gate, participant-scope, public-field discipline,
provider-scope — per each module's manifest `acceptanceCriteria`) AND `docs/{module}.md` committed with the code.
