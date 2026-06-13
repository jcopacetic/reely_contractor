# @contractor/web

Next.js 15 (App Router) — the Contractor front end. Two surfaces: the authenticated `/contractor` club app and
the anonymous public `/pro/[slug]` profiles. The browser **never** calls the api directly: `lib/api.ts` is a
server-only client (RSC / server actions) that holds the service key and presents the acting Clerk user + role
as headers.

## Surfaces
- **`/pro/[slug]`** — public marketing profile (safe-subset only, only when `is_public`; non-public/unknown
  slug 404s). ISR-cacheable. `/pro/sitemap.xml` enumerates public slugs.
- **`/contractor/apply`, `/contractor/status`** — the applicant flow: any signed-in user.
- **`/contractor/**`** (dashboard, feed, dms, profile, onboarding, work, bids, contracts, u/…) — the club app:
  Clerk `contractor` flag ONLY.

App routes live in `app/`; the per-feature components (feed, dms, listing composer/bids, bid form, my-bids,
work browse, contract detail, time panel, profile/follow/message buttons, json-ld) live in `components/`.

## Gating (`middleware.ts`)
`clerkMiddleware` protects the whole `/contractor` area (requires sign-in); `/contractor/apply` + `/status` are
then open to any signed-in user; the rest of the club app requires the dedicated **`contractor` flag** in
`publicMetadata` (mirrored on vetting approval) — gated on the flag, NOT the portfolio-wide `role` (a user can
be an admin AND a contractor). A signed-in non-contractor is redirected to `/contractor/status`. `/pro/*` is
public. Clerk activates only when its keys are present (local dev bypasses the gate).

## Dev
```bash
pnpm --filter @contractor/web dev        # next dev (:3100)
pnpm --filter @contractor/web build
pnpm --filter @contractor/web typecheck
```
Env: `CONTRACTOR_API_URL` (default `http://localhost:3101`), `CONTRACTOR_SERVICE_KEY`, and the Clerk keys.
Authenticated reads are `no-store`; only the anonymous public profile read opts into ISR (`revalidate`).
