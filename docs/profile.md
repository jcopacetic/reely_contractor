# profile — as-built

*The contractor's linktree-style profile + onboarding setup. A profile is an INDIVIDUAL — a person, not a
company. Holds the node's strictest public-field discipline (the only anonymous read surface).*

## What it does
Owns `contractor_profile` + `onboarding_doc`. Procedures (`router.ts`):
- **`getOwn`** (vetted) — the editor view: own profile + accepted docs + onboarding state (null until
  first save).
- **`update`** (vetted) — one-save upsert of the editable fields: `firstName`/`lastName` (private),
  `company`/`position` (optional public attributes), `headline`, `bio`, `avatarUrl`, `links` (≤10),
  `categoryIds` (validated against active skill categories), and the optional public `slug`. **`displayName`
  is DERIVED from first + last name** — never set directly from a company field.
- **`setPublic`** (vetted) — toggle `is_public`; refuses to go public without a slug (`slug_required`).
- **`checkSlug`** (vetted) — pure availability check (no write) for the onboarding "Check" button.
- **`acceptDoc` / `completeOnboarding`** (vetted) — accept a required doc (`contractor-agreement`); finish
  onboarding once name + ≥1 category + all required docs are present (else returns the `missing` list).
- **`listCategories`** (vetted) — the active skill-category vocabulary for the picker.
- **`getPublic`** (public) — the anonymous safe-subset read by slug, only when `is_public`.
- **`publicSitemap`** (public) — public slugs + lastmod for the `/pro` sitemap (bounded `take 5000`).

`contracts_completed` / `hours_logged` are system-written rollups (Phase 2) and are never editable here.

## Files
- `apps/api/src/modules/profile/router.ts` — surface (vetted editor + anonymous public reads).
- `apps/api/src/modules/profile/store.ts` — upsert/derive logic, slug rules, `getPublic` safe subset.

## Security/scoping
Editor + onboarding procedures are `vettedProcedure` (user-scoped to the acting contractor, keyed on
`clerkUserId`). `getPublic`/`publicSitemap` are `publicProcedure` (anonymous). **Public-field discipline:**
`getPublic` selects and returns ONLY `displayName, company, position, headline, bio, categories, avatarUrl,
links, contractsCompleted, hoursLogged` — never raw `firstName`/`lastName` or any account/identity internals,
and only for `is_public` profiles (a non-public/unknown slug returns null → 404). This subset is locked by
an e2e test. RLS exists in `rls.sql` but the store queries the bare `prisma` client (not `withUser`), so the
app-layer `vettedProcedure` + the explicit `getPublic` field selection are the real, verified boundary; RLS
is a defined backstop to be wired via `withUser` later — do not rely on it as the active enforcement.

## Verified
`pnpm typecheck` 5/5 · `pnpm test` (unit) 9/9 · `pnpm --filter @contractor/api test:e2e` 14/14 (incl. the
public-field-discipline invariant). Prisma Migrate-managed (`0_init` + `1_add_contractor_name_company_position`,
which added `firstName`/`lastName`/`company`/`position`); applied to prod via the Supabase MCP.

## Out of scope
E-sign / document storage (v1 doc acceptance is an acknowledgement upsert) · avatar upload to R2 (the field
holds a URL) · the rollup writers (`contracts_completed`/`hours_logged`, Phase 2) · the authenticated in-club
profile view (that's graph's `getClubProfile`, a richer non-anonymous read).
