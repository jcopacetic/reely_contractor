# profile — Contractor Module Spec
*AppForge · Contractor · 2026-06-05 · build order 2/10*

**id:** `profile` · **scope:** mvp · **accessType:** core · **environmentType:** surface

## Purpose
The public marketing profile (the one public surface, simpler-than-Linktree) and the in-club professional profile. Owns `contractor_profile`; manages `is_public`/`public_slug`/`links`/`category_ids`; surfaces the system-driven rollups (`contracts_completed`, `hours_logged`) read-only.

## Triggers
- `edit` (manual; permission: contractor [self]) — update profile, toggle public, set slug.
- `get-public` (manual; permission: public) — unauthenticated read of the safe subset.
- `rollup-refresh` (event: `contract.status.changed`, `time_entry.approved`; permission: system) — recompute cached rollups.

## Data access
- **reads:** `contractor_profile`, `skill_category`
- **writes:** `contractor_profile`
- **emits:** `profile.updated`

## Endpoints
- `get-own` / `update` / `set-public` / `set-slug` (action/query; self)
- `get-public` (query; **public**, safe subset only)

## Config
- `maxLinks` (default 10) · `slugPattern` (lowercase-kebab).

## Depends on
`contractor-identity`.

## Acceptance criteria
- `get-public` returns only `{display_name, headline, bio, category_ids→labels, avatar_url, links, contracts_completed, hours_logged}` and only when `is_public`; a non-public slug `404`s.
- Rollups are read-only (system-driven), refreshed on contract/time events; never user-writable.
- `public_slug` unique; user-scope on private fields.
- `public-field-discipline` + `user-scope-isolation` harness passes.

## Out of scope
Vetting (contractor-identity), `skill_category` management (contractor-admin), social profile/feed (staged), financial data (never on the profile).
