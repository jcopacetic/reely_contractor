# contractor-identity — Contractor Module Spec
*AppForge · Contractor · 2026-06-05 · build order 1/10*

**id:** `contractor-identity` · **scope:** mvp · **accessType:** core · **environmentType:** background

## Purpose
Owns `contractor_identity` (the verified profile on the base User) and the application/invite → manual-review → approve state machine. Exposes the vetting hard-gate (`ctx.identity.requireVetted()`) every other module checks. Foundational — built first.

## Triggers
- `apply` (manual; permission: applicant) — submit an application.
- `redeem-invite` (manual; permission: applicant) — accept an invite code.
- `review` (manual; permission: platform_admin) — set `in_review`, attach the video-call link, approve/reject.
- `vetting-effects` (event: `contractor.approved`/`rejected`; permission: system) — email + identity flip side-effects.

## Data access
- **reads:** `contractor_identity`, `application`, `invite`
- **writes:** `contractor_identity`, `application`, `invite`
- **emits:** `application.submitted`, `contractor.approved`, `contractor.rejected`, `contractor.suspended`

## Endpoints
- `apply` / `redeem-invite` (action; session) · `get-status` (query; self)
- `create-invite` / `review` / `approve` / `reject` / `suspend` (action; admin)

## Config
- `inviteExpiryDays` (default 30) · `singleAdmin` (default true — v1).

## Depends on
None (foundational).

## Acceptance criteria
- State machine correct: `submitted → in_review → approved|rejected`; approve flips `contractor_identity.status = vetted` and stamps `vetted_at`; suspend flips the gate closed immediately.
- `requireVetted()` returns the gate the whole node enforces; applicants/suspended fail it.
- Invite codes unique and expire; single-admin review in v1, multi-reviewer-ready.
- User-scope isolation; emits events; `vetting-gate` + `user-scope-isolation` harness passes.

## Out of scope
Profile content (profile), enforcing gated endpoints (each module calls the gate), payments, the video-call tool itself (manual link).
