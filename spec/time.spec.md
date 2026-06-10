# time — Contractor Module Spec
*AppForge · Contractor · 2026-06-05 · build order 6/10*

**id:** `time` · **scope:** mvp · **accessType:** core · **environmentType:** interactive

## Purpose
Owns `time_entry`. Runs the timer (start/stop) and accepts browser-extension + manual entries against a contract. Client approval of an entry is what makes it billable — only `approved` time feeds the weekly cycle.

## Triggers
- `timer` (manual; permission: contractor [own contract]) — start/stop/manual entry.
- `approve` (manual; permission: participant [the contract's client]) — approve an entry.
- `provider-read` (provider; `CONTRACTOR_SERVICE_KEY`) — Board reads/approves a contract's time.

## Data access
- **reads:** `time_entry`, `contract`
- **writes:** `time_entry`
- **emits:** `time_entry.created`, `time_entry.approved`

## Endpoints
- `start` / `stop` / `manual-entry` (action; contractor) · `list-time` (query; participant) · `approve` (action; client)
- provider: `GET /provider/contracts/{id}/time-entries`, `POST /provider/time-entries/{id}/approve` (`ctx.providerAuth`, contract-scoped)

## Config
- `maxRunningHours` (default 12; auto-stop guard) · `minEntrySeconds` (default 60).

## Depends on
`contracts`, `contractor-identity`.

## Acceptance criteria
- Timer + extension + manual entries write `time_entry` with the right `source`; a running entry has a null `ended_at` until stopped.
- Only the contractor writes their own entries (user-scope); only the contract's client can set `approved`.
- **Only `approved` entries are billable** — the cycle worker sums approved time exclusively.
- Provider read/approve is scoped to the named contract; never an unscoped time export.
- `user-scope-isolation` + `participant-scope-isolation` + `provider-scope` + `approved-time-only` harness passes.

## Out of scope
Billing/charge (payments), the extension client itself (frontend/extension runtime), Board's contractor-view timer UI (consumes via the provider surface).
