# contractor-admin — Contractor Module Spec
*AppForge · Contractor · 2026-06-05 · build order 10/10*

**id:** `contractor-admin` · **scope:** mvp · **accessType:** core · **environmentType:** interactive

## Purpose
The single-admin console: the vetting queue (surfacing `contractor-identity`'s review actions), `skill_category` management (the curated vocabulary), cross-cutting ops, and controller integration. Cross-cutting read/ops only; never silently edits a contractor's contract or financial content.

## Triggers
- `admin-action` (manual; permission: platform_admin) — vetting queue, categories, flags, ops.
- `command` (event: `controller.command.received`; permission: system)

## Data access
- **reads:** `application`, `invite`, `report_summary`, `feature_flag`, `skill_category`, `contract`, `charge`, `dispute` (ops aggregates)
- **writes:** `skill_category`, `feature_flag`
- **emits:** `admin.config.changed`

## Endpoints
- `vetting-queue` (query; admin) — pending applications + invites; approve/reject **delegate to `contractor-identity`**.
- `manage-categories` (action; admin) — CRUD the curated `skill_category` vocabulary.
- `ops-summary` (query; admin) — vetting/marketplace/contracts/payments aggregates from `report_summary`.
- `flags` (action; admin) — `ctx.flags`.
- controller `report` / `command` / `health` (system).

## Config
- `summaryRefreshSeconds` (default 300).

## Depends on
`contractor-identity` (delegates vetting decisions).

## Acceptance criteria
- Every endpoint rejects non-`platform_admin` principals.
- Manages the curated `skill_category` vocabulary (the source the feed/profile filter on); not derived from Catalog taxonomy.
- Surfaces the vetting queue and delegates approve/reject to `contractor-identity` (does not re-implement the state machine).
- Ops summaries from `report_summary`; never silently edits contract/financial content.
- Controller commands idempotent (`pause_payments`, `pause_vetting`, `recompute_summary`); emits `admin.config.changed`; admin-only harness passes.

## Out of scope
The vetting state machine itself (contractor-identity), tenant settings (none — user-scoped node), end-user contract/financial edits.
