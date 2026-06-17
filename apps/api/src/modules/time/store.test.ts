import { describe, expect, it } from 'vitest'
import { bucketSummary, toView, timerStartGuard, type TimeEntryView } from './store'

/**
 * UNIT tests for the pure logic in store.ts — no DB. We test:
 *   - toView(row): DB row → view shape, deriving `verified` (timer/extension vs manual) + `running`.
 *   - bucketSummary(views): the extracted pure aggregation core of summarize() — folds entries into
 *     approved/pending/disputed buckets + the running entry id (the groupBy enrichment that summarize()
 *     wraps is DB-bound and exercised in the e2e suite, so we test the pure fold directly).
 *
 * Determinism: every Date is built from a hard-coded ISO literal; nothing reads the clock or random.
 */

// Fixed timestamps (literals — never `new Date()`).
const STARTED = '2026-01-02T03:04:05.000Z'
const ENDED = '2026-01-02T05:04:05.000Z'
const APPROVED_AT = '2026-01-03T00:00:00.000Z'
const DISPUTED_AT = '2026-01-04T12:30:00.000Z'

type Row = Parameters<typeof toView>[0]

// A fully-populated, ended row with sane defaults; override per test.
function row(over: Partial<Row> = {}): Row {
  return {
    id: 'e1',
    contractId: 'c1',
    contractorUserId: 'u1',
    startedAt: new Date(STARTED),
    endedAt: new Date(ENDED),
    durationSeconds: 7200,
    description: 'wrote tests',
    source: 'timer',
    approved: false,
    approvedAt: null,
    disputed: false,
    disputeReason: null,
    disputedAt: null,
    ...over,
  }
}

// A minimal view for bucket tests; override per test.
function view(over: Partial<TimeEntryView> = {}): TimeEntryView {
  return {
    id: 'v1',
    contractId: 'c1',
    contractorUserId: 'u1',
    startedAt: STARTED,
    endedAt: ENDED,
    durationSeconds: 100,
    description: null,
    source: 'timer',
    verified: true,
    approved: false,
    approvedAt: null,
    disputed: false,
    disputeReason: null,
    disputedAt: null,
    running: false,
    activitySamples: 0,
    avgActivityPct: null,
    ...over,
  }
}

describe('toView — DB row → view mapping', () => {
  it('passes through identity/description fields verbatim', () => {
    const v = toView(row({ id: 'abc', contractId: 'con', contractorUserId: 'usr', description: 'hi' }))
    expect(v.id).toBe('abc')
    expect(v.contractId).toBe('con')
    expect(v.contractorUserId).toBe('usr')
    expect(v.description).toBe('hi')
    expect(v.durationSeconds).toBe(7200)
  })

  it('serialises startedAt/endedAt to ISO strings', () => {
    const v = toView(row())
    expect(v.startedAt).toBe(STARTED)
    expect(v.endedAt).toBe(ENDED)
    expect(typeof v.startedAt).toBe('string')
  })

  it('maps a null endedAt → null and marks the entry running', () => {
    const v = toView(row({ endedAt: null }))
    expect(v.endedAt).toBeNull()
    expect(v.running).toBe(true)
  })

  it('an ended entry is NOT running', () => {
    const v = toView(row({ endedAt: new Date(ENDED) }))
    expect(v.running).toBe(false)
  })

  it('source "timer" is verified (activity-backed)', () => {
    const v = toView(row({ source: 'timer' }))
    expect(v.source).toBe('timer')
    expect(v.verified).toBe(true)
  })

  it('source "extension" is verified (activity-backed)', () => {
    const v = toView(row({ source: 'extension' }))
    expect(v.source).toBe('extension')
    expect(v.verified).toBe(true)
  })

  it('source "manual" is NOT verified (self-reported)', () => {
    const v = toView(row({ source: 'manual' }))
    expect(v.source).toBe('manual')
    expect(v.verified).toBe(false)
  })

  it('verified is purely a source !== "manual" check (any non-manual string is verified)', () => {
    // Defensive: the column is a string; only the literal "manual" flips verified off.
    const v = toView(row({ source: 'something-else' as Row['source'] }))
    expect(v.verified).toBe(true)
  })

  it('serialises approvedAt when present, null otherwise', () => {
    expect(toView(row({ approved: true, approvedAt: new Date(APPROVED_AT) })).approvedAt).toBe(APPROVED_AT)
    expect(toView(row({ approvedAt: null })).approvedAt).toBeNull()
  })

  it('carries the approved flag through', () => {
    expect(toView(row({ approved: true })).approved).toBe(true)
    expect(toView(row({ approved: false })).approved).toBe(false)
  })

  it('serialises disputedAt + carries dispute fields', () => {
    const v = toView(row({ disputed: true, disputeReason: 'too long', disputedAt: new Date(DISPUTED_AT) }))
    expect(v.disputed).toBe(true)
    expect(v.disputeReason).toBe('too long')
    expect(v.disputedAt).toBe(DISPUTED_AT)
  })

  it('null dispute fields stay null', () => {
    const v = toView(row({ disputed: false, disputeReason: null, disputedAt: null }))
    expect(v.disputed).toBe(false)
    expect(v.disputeReason).toBeNull()
    expect(v.disputedAt).toBeNull()
  })

  it('preserves a null description', () => {
    expect(toView(row({ description: null })).description).toBeNull()
  })

  it('always seeds activity fields empty (enrichment happens later, not in toView)', () => {
    const v = toView(row())
    expect(v.activitySamples).toBe(0)
    expect(v.avgActivityPct).toBeNull()
  })

  it('preserves a zero duration verbatim (no clamping in the mapper)', () => {
    expect(toView(row({ durationSeconds: 0 })).durationSeconds).toBe(0)
  })

  it('preserves a negative duration verbatim (mapper does not sanitise)', () => {
    expect(toView(row({ durationSeconds: -5 })).durationSeconds).toBe(-5)
  })
})

describe('bucketSummary — aggregate views into billing buckets', () => {
  it('empty input → all zero, no running id, empty entries', () => {
    const s = bucketSummary([])
    expect(s.approvedSeconds).toBe(0)
    expect(s.pendingSeconds).toBe(0)
    expect(s.disputedSeconds).toBe(0)
    expect(s.runningEntryId).toBeNull()
    expect(s.entries).toEqual([])
  })

  it('returns the same entries array it was given (passthrough)', () => {
    const entries = [view({ id: 'a' }), view({ id: 'b' })]
    const s = bucketSummary(entries)
    expect(s.entries).toBe(entries)
    expect(s.entries).toHaveLength(2)
  })

  it('sums approved (ended) entries into approvedSeconds only', () => {
    const s = bucketSummary([
      view({ approved: true, durationSeconds: 100 }),
      view({ approved: true, durationSeconds: 250 }),
    ])
    expect(s.approvedSeconds).toBe(350)
    expect(s.pendingSeconds).toBe(0)
    expect(s.disputedSeconds).toBe(0)
  })

  it('sums un-approved, un-disputed entries into pendingSeconds', () => {
    const s = bucketSummary([
      view({ approved: false, disputed: false, durationSeconds: 60 }),
      view({ approved: false, disputed: false, durationSeconds: 90 }),
    ])
    expect(s.pendingSeconds).toBe(150)
    expect(s.approvedSeconds).toBe(0)
    expect(s.disputedSeconds).toBe(0)
  })

  it('sums disputed (un-approved) entries into disputedSeconds', () => {
    const s = bucketSummary([
      view({ approved: false, disputed: true, durationSeconds: 30 }),
      view({ approved: false, disputed: true, durationSeconds: 70 }),
    ])
    expect(s.disputedSeconds).toBe(100)
    expect(s.approvedSeconds).toBe(0)
    expect(s.pendingSeconds).toBe(0)
  })

  it('records the running entry id and excludes it from every total', () => {
    const s = bucketSummary([
      view({ id: 'run', running: true, durationSeconds: 999 }),
      view({ id: 'done', approved: true, durationSeconds: 100 }),
    ])
    expect(s.runningEntryId).toBe('run')
    expect(s.approvedSeconds).toBe(100)
    expect(s.pendingSeconds).toBe(0)
    expect(s.disputedSeconds).toBe(0)
  })

  it('a running entry counts in no bucket even if its approved/disputed flags are set', () => {
    // running is checked FIRST — an open timer never bills, regardless of stale flags.
    const s = bucketSummary([view({ id: 'r', running: true, approved: true, disputed: true, durationSeconds: 500 })])
    expect(s.runningEntryId).toBe('r')
    expect(s.approvedSeconds).toBe(0)
    expect(s.disputedSeconds).toBe(0)
    expect(s.pendingSeconds).toBe(0)
  })

  it('approved takes precedence over disputed (approval resolves a dispute)', () => {
    const s = bucketSummary([view({ approved: true, disputed: true, durationSeconds: 80 })])
    expect(s.approvedSeconds).toBe(80)
    expect(s.disputedSeconds).toBe(0)
    expect(s.pendingSeconds).toBe(0)
  })

  it('the last running entry wins when several are open', () => {
    const s = bucketSummary([
      view({ id: 'r1', running: true }),
      view({ id: 'r2', running: true }),
    ])
    expect(s.runningEntryId).toBe('r2')
  })

  it('mixed ledger: each bucket gets exactly its slice', () => {
    const s = bucketSummary([
      view({ id: 'a', approved: true, durationSeconds: 100 }),
      view({ id: 'b', approved: true, durationSeconds: 200 }),
      view({ id: 'c', disputed: true, durationSeconds: 50 }),
      view({ id: 'd', durationSeconds: 25 }), // pending
      view({ id: 'e', durationSeconds: 75 }), // pending
      view({ id: 'r', running: true, durationSeconds: 9999 }),
    ])
    expect(s.approvedSeconds).toBe(300)
    expect(s.disputedSeconds).toBe(50)
    expect(s.pendingSeconds).toBe(100)
    expect(s.runningEntryId).toBe('r')
    expect(s.entries).toHaveLength(6)
  })

  it('a zero-duration ended entry contributes nothing but is still bucketed', () => {
    const s = bucketSummary([view({ approved: true, durationSeconds: 0 })])
    expect(s.approvedSeconds).toBe(0)
  })

  it('runningEntryId stays null when no entry is running', () => {
    const s = bucketSummary([view({ approved: true }), view({ disputed: true })])
    expect(s.runningEntryId).toBeNull()
  })
})

describe('timerStartGuard — one individual, ≤2 tasks, one client', () => {
  const t = { contractId: 'cB', clientUserId: 'client1' }
  it('allows the first timer', () => {
    expect(timerStartGuard([], t)).toBeNull()
  })
  it('allows a 2nd concurrent task for the SAME client', () => {
    expect(timerStartGuard([{ contractId: 'cA', clientUserId: 'client1' }], t)).toBeNull()
  })
  it('blocks a 3rd concurrent task (cap = 2)', () => {
    const running = [{ contractId: 'cA', clientUserId: 'client1' }, { contractId: 'cC', clientUserId: 'client1' }]
    expect(timerStartGuard(running, t)).toBe('max_concurrent_timers')
  })
  it('blocks clocking a second client at the same time', () => {
    expect(timerStartGuard([{ contractId: 'cA', clientUserId: 'other' }], t)).toBe('other_client_running')
  })
  it('blocks a duplicate timer on the same contract', () => {
    expect(timerStartGuard([{ contractId: 'cB', clientUserId: 'client1' }], t)).toBe('timer_already_running')
  })
  it('the same-contract check wins over the cap', () => {
    const running = [{ contractId: 'cB', clientUserId: 'client1' }, { contractId: 'cC', clientUserId: 'client1' }]
    expect(timerStartGuard(running, t)).toBe('timer_already_running')
  })
  it('the other-client check wins over the cap', () => {
    const running = [{ contractId: 'cA', clientUserId: 'client1' }, { contractId: 'cC', clientUserId: 'other' }]
    expect(timerStartGuard(running, t)).toBe('other_client_running')
  })
  it('respects a custom cap', () => {
    expect(timerStartGuard([{ contractId: 'cA', clientUserId: 'client1' }], t, 1)).toBe('max_concurrent_timers')
  })
})
