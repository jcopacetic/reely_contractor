# contracts — Contractor Module Spec
*AppForge · Contractor · 2026-06-05 · build order 5/10*

**id:** `contracts` · **scope:** mvp · **accessType:** core · **environmentType:** background

## Purpose
Owns `contract` (the expandable living container) + `contract_item`. Manages the lifecycle and is the source of the `contract_ref` Board's `access-control` grants against. Exposes the Board-callable provider create/read surface — a hire on the Board side creates a Contract here.

## Triggers
- `create-contract` (manual: participant session **or** provider/system on hire) — from an accepted bid or a direct arrangement.
- `manage` (manual; permission: participant) — add/update items, change status.
- `provider-intake` (provider; `CONTRACTOR_SERVICE_KEY`) — Board create-contract / read-contract.

## Data access
- **reads:** `contract`, `contract_item`, `bid`, `listing`
- **writes:** `contract`, `contract_item`
- **emits:** `contract.created`, `contract.item.added`, `contract.status.changed`

## Endpoints
- `create-contract` / `get-contract` (action/query; participant) · `add-item` / `update-item` / `update-status` (action; participant)
- provider: `POST /provider/contracts`, `GET /provider/contracts/{id}` (`ctx.providerAuth`, resource-scoped)

## Config
- `maxItemsPerContract` (default 500).

## Depends on
`marketplace`, `contractor-identity`.

## Acceptance criteria
- A Contract is a living container: `contract_item` rows (milestone/scope_add/deliverable/note) added over time; the contract is never re-created to extend it.
- Participant-scoped (client + contractor); the contractor party must be `vetted`.
- `create-contract` references an accepted bid / listing the caller owns; `board_ref` stored as an opaque reference.
- `contract.id` is the stable `contract_ref` Board grants against; `contract.created` lets Board mint its grant.
- `participant-scope-isolation` + `provider-scope` + `cross-app-reference-integrity` + `vetting-gate` harness passes.

## Out of scope
Time tracking (time), billing/charge (payments), messaging (messaging), Board's grant itself (Board access-control).
