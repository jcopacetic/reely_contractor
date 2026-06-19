# Notifications

Two delivery paths, picked by signal strength:

## 1. Digest path — `notify.ts` (ambient ceremony events)
`emit()` fans a **curated allow-list** of ceremony events (`standup.posted`, `sprint.*`, `blocker.*`,
`change_request.*`, `charter.*`) into one in-app `Notification` row for the **counterparty**
(`recipientFor`: a contractor-actor notifies the client; anyone else notifies the contractor). The daily
`notifications-email.ts` cron rolls unread + un-emailed rows into a single Resend digest. Respects the
recipient's per-category in-app pref (`inAppEnabled` / `categoryForCeremony`). This is the quiet default —
many small events, batched.

## 2. Immediate path — `notify-now.ts` (high-signal: money / needs-action / conversion)
`notifyNow(userId, { type, title, subject, lines, ctaHref?, ctaLabel?, payload? })` writes an in-app row
**pre-stamped `emailedAt`** (so the digest won't re-send it) **and** sends a transactional Resend email now.
Email-interpolated text is HTML-escaped (the 2026-06-19 email-injection hardening). `ctaHref: null` omits the
button — used when the recipient is a Board-side client we can't deep-link. Resend stubs without a key (the
in-app row still lands), so tests assert the row.

### P0 wiring (the 2026-06-19 notification-matrix card — "silent high-signal events")
| Event | Recipient | Channels | Site |
|---|---|---|---|
| `identity.vetted` — application approved | the newly-vetted contractor | email + in-app | `contractor-identity/store.ts` `approve()` |
| `payment.received` — a weekly invoice settled | the contractor (money-in) | email + in-app | `payments/store.ts` `notifyContractorPaid()` (fired from both the stub charge path and the live webhook — only one runs per env) |
| `billing.card_needed` — invoice ready but no card on file | the client (needs-action; lives in Board → no deep link) | email + in-app | `payments/store.ts` `chargeDueCycles()` on `charge.awaiting_payment_method` |
| `bid.submitted` — new bid on a listing | the listing owner | **in-app only** (a listing can take up to `MAX_BIDS_PER_LISTING` — emailing each would flood) | `marketplace/store.ts` `submitBid()` |
| `bid.accepted` — bid accepted | the winning bidder | email + in-app | `marketplace/store.ts` `acceptBid()` |

Vetting approval is the #1 conversion lever: a vetted contractor who's never told they're in does nothing.

### P1 wiring (the matrix card — hire, feedback, documents, social)
| Event | Recipient | Channels | Path |
|---|---|---|---|
| `contract.created` — a hire's contract is active | the contractor ("you're hired"; covers a Board-direct hire that never had a bid accept) | email + in-app | immediate (`contracts/store.ts` `createContract`) — explicit, since the allow-list's counterparty routing would mis-target the client |
| `review.created` — a client left a review | the contractor (so they can approve a weekly for display) | in-app + digest | allow-list (`notify.ts`) |
| `doc.added` — a document needs a signature | the counterparty | in-app + digest | allow-list |
| `doc.signed` / `doc.executed` | the counterparty | in-app + digest | allow-list |
| `follow.created` — a new follower | the followed contractor | **in-app only** (ambient social, never email) | direct row (`graph/store.ts`) |
| `comment.created` (feed post) | the post author (skips self) | **in-app only** | direct row (`feed/store.ts`) |

Social rows use `ceremony:'social'` (no dedicated pref category yet → defaults on). The allow-list additions
fold into the "Work & ceremonies" category. Reactions emit no event (no notification by design — too noisy).

Pre-existing immediate senders (`payments/notices.ts` `sendNewWeekNotices` / `sendChargeReminders`) inline the
same shape for the scheduled weekly billing nudges; `notify-now.ts` is the shared, CTA-flexible version.

Tests: `e2e/contractor.e2e.test.ts` → "P0 notifications — silent high-signal events" (vetting + bids) and the
"payment.received" assertion in the billing-engine charge test.
