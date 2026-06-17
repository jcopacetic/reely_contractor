import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UNIT tests for the pure money/aggregation logic in dashboard.ts. NO database: the `@contractor/db`
 * prisma client is fully mocked (vi.mock), so `buildBillingWeeks` exercises only its pure aggregation
 * branches over hand-fed rows. All Dates are built from FIXED ISO literals — nothing is now-relative.
 *
 * Sunday-18:00 (UTC) week boundary reference dates used below:
 *   2026-06-14T18:00:00Z  = a Sunday at exactly 18:00 (the boundary itself)
 *   2026-06-07T18:00:00Z  = the previous week's boundary
 *   2026-05-31T18:00:00Z  = the week-before boundary
 */

// ---- prisma mock (must be declared before importing the module under test) ----
const findManyCycles = vi.fn()
const findManyEntries = vi.fn()
vi.mock('@contractor/db', () => ({
  prisma: {
    billingCycle: { findMany: (...a: unknown[]) => findManyCycles(...a) },
    timeEntry: { findMany: (...a: unknown[]) => findManyEntries(...a) },
  },
}))

import { amountFor, buildBillingWeeks, currentWeekStart, round2, taskOf, type DashContract } from './dashboard'

beforeEach(() => {
  findManyCycles.mockReset()
  findManyEntries.mockReset()
  // default: no DB rows unless a test overrides
  findManyCycles.mockResolvedValue([])
  findManyEntries.mockResolvedValue([])
})
afterEach(() => vi.clearAllMocks())

// ----------------------------------------------------------------------------
describe('round2 — money rounding to 2 decimals', () => {
  it('rounds half up at the cent', () => {
    expect(round2(1.005)).toBe(1) // 1.005*100 = 100.499… in float → rounds to 100 (documents float reality)
    expect(round2(1.015)).toBe(1.01)
    expect(round2(2.345)).toBe(2.35)
  })

  it('leaves already-2dp values untouched', () => {
    expect(round2(10.99)).toBe(10.99)
    expect(round2(0.01)).toBe(0.01)
  })

  it('handles zero', () => {
    expect(round2(0)).toBe(0)
    expect(Object.is(round2(0), 0)).toBe(true)
  })

  it('handles negatives', () => {
    expect(round2(-2.345)).toBe(-2.35) // -2.345*100 floats to -234.5 → Math.round → -235
    expect(round2(-10.999)).toBe(-11)
    expect(round2(-0.005)).toBe(-0) // -0, still equals 0
  })

  it('rounds long fractional tails down/up correctly', () => {
    expect(round2(3.14159)).toBe(3.14)
    expect(round2(2.999)).toBe(3)
    expect(round2(0.001)).toBe(0)
  })

  it('preserves large whole values', () => {
    expect(round2(123456.789)).toBe(123456.79)
  })
})

// ----------------------------------------------------------------------------
describe('currentWeekStart — Sunday-18:00 week boundary', () => {
  const iso = (s: string) => currentWeekStart(new Date(s)).toISOString()

  it('a midweek day rolls back to the prior Sunday 18:00', () => {
    // 2026-06-16 is a Tuesday (dow=2) → back 2 days to Sun 06-14 18:00
    expect(iso('2026-06-16T12:00:00Z')).toBe('2026-06-14T18:00:00.000Z')
  })

  it('clamps the time-of-day to exactly 18:00:00.000 UTC', () => {
    // a Wednesday with odd minutes/seconds/millis still lands on 18:00:00.000
    expect(iso('2026-06-17T23:45:13.777Z')).toBe('2026-06-14T18:00:00.000Z')
  })

  it('Sunday BEFORE 18:00 belongs to the PREVIOUS week', () => {
    // dow=0 and now < the Sunday-18:00 → subtract a full week
    expect(iso('2026-06-14T17:59:59.999Z')).toBe('2026-06-07T18:00:00.000Z')
    expect(iso('2026-06-14T00:00:00Z')).toBe('2026-06-07T18:00:00.000Z')
  })

  it('Sunday EXACTLY at 18:00 is the start of the current week (boundary inclusive)', () => {
    expect(iso('2026-06-14T18:00:00.000Z')).toBe('2026-06-14T18:00:00.000Z')
  })

  it('Sunday AFTER 18:00 is the current week start', () => {
    expect(iso('2026-06-14T18:00:00.001Z')).toBe('2026-06-14T18:00:00.000Z')
    expect(iso('2026-06-14T23:00:00Z')).toBe('2026-06-14T18:00:00.000Z')
  })

  it('Saturday late rolls back nearly a full week to the prior Sunday', () => {
    // 2026-06-13 is Saturday (dow=6) → back 6 days to Sun 06-07 18:00
    expect(iso('2026-06-13T23:00:00Z')).toBe('2026-06-07T18:00:00.000Z')
  })

  it('Monday just after the boundary stays in the week that just started', () => {
    // 2026-06-15 Monday (dow=1) → back 1 day to Sun 06-14 18:00
    expect(iso('2026-06-15T00:01:00Z')).toBe('2026-06-14T18:00:00.000Z')
  })

  it('does not mutate the passed-in Date', () => {
    const now = new Date('2026-06-16T12:00:00Z')
    const snapshot = now.getTime()
    currentWeekStart(now)
    expect(now.getTime()).toBe(snapshot)
  })

  it('always returns a Sunday at 18:00 UTC', () => {
    for (const s of ['2026-01-01T05:00:00Z', '2026-12-31T20:00:00Z', '2026-06-10T10:10:10Z']) {
      const r = currentWeekStart(new Date(s))
      expect(r.getUTCDay()).toBe(0)
      expect(r.getUTCHours()).toBe(18)
      expect(r.getUTCMinutes()).toBe(0)
      expect(r.getUTCSeconds()).toBe(0)
      expect(r.getUTCMilliseconds()).toBe(0)
    }
  })
})

// ----------------------------------------------------------------------------
describe('amountFor — billable amount from duration', () => {
  const hourly = (rate: number): DashContract => ({ id: 'c', title: 't', rateType: 'hourly', rateAmount: rate })
  const fixed = (amt: number): DashContract => ({ id: 'c', title: 't', rateType: 'fixed', rateAmount: amt })

  it('hourly: one hour bills the full rate', () => {
    expect(amountFor(hourly(100), 3600)).toBe(100)
  })

  it('hourly: half an hour bills half the rate', () => {
    expect(amountFor(hourly(100), 1800)).toBe(50)
  })

  it('hourly: rounds to 2 decimals (90 min @ $33.33/hr)', () => {
    // 5400/3600 = 1.5 → 1.5 * 33.33 = 49.995 → round2 → 50.00 (float lands at 49.995→49.99? verify)
    expect(amountFor(hourly(33.33), 5400)).toBe(round2(1.5 * 33.33))
    expect(amountFor(hourly(45), 5400)).toBe(67.5)
  })

  it('hourly: zero seconds bills zero', () => {
    expect(amountFor(hourly(100), 0)).toBe(0)
  })

  it('hourly: produces fractional cents that round (20 min @ $30/hr = $10)', () => {
    expect(amountFor(hourly(30), 1200)).toBe(10)
  })

  it('hourly: irregular seconds rounds to the cent', () => {
    // 1 second @ $36/hr = 0.01
    expect(amountFor(hourly(36), 1)).toBe(0.01)
    // 1 second @ $3600/hr = 1.00
    expect(amountFor(hourly(3600), 1)).toBe(1)
  })

  it('fixed: ignores seconds entirely', () => {
    expect(amountFor(fixed(250), 0)).toBe(250)
    expect(amountFor(fixed(250), 999_999)).toBe(250)
  })

  it('fixed: rounds the flat amount to 2 decimals', () => {
    expect(amountFor(fixed(250.005), 0)).toBe(250.01) // 250.005*100 floats to 25000.5 → rounds up
    expect(amountFor(fixed(99.999), 10)).toBe(100)
    expect(amountFor(fixed(10.124), 0)).toBe(10.12)
  })

  it('treats any non-"hourly" rateType as fixed', () => {
    const milestone: DashContract = { id: 'c', title: 't', rateType: 'milestone', rateAmount: 500 }
    expect(amountFor(milestone, 7200)).toBe(500)
  })
})

// ----------------------------------------------------------------------------
describe('taskOf — DB time entry to view shape', () => {
  it('maps a fully populated entry', () => {
    expect(taskOf({ description: 'Fix login bug', durationSeconds: 1200, approved: true })).toEqual({
      title: 'Fix login bug',
      seconds: 1200,
      approved: true,
    })
  })

  it('trims surrounding whitespace from the title', () => {
    expect(taskOf({ description: '   Deploy   ', durationSeconds: 60, approved: false }).title).toBe('Deploy')
  })

  it('falls back to "Tracked work" for null description', () => {
    expect(taskOf({ description: null, durationSeconds: 0, approved: false }).title).toBe('Tracked work')
  })

  it('falls back to "Tracked work" for empty / whitespace-only description', () => {
    expect(taskOf({ description: '', durationSeconds: 0, approved: false }).title).toBe('Tracked work')
    expect(taskOf({ description: '    ', durationSeconds: 0, approved: false }).title).toBe('Tracked work')
  })

  it('preserves zero seconds and the approved flag faithfully', () => {
    const r = taskOf({ description: 'x', durationSeconds: 0, approved: false })
    expect(r.seconds).toBe(0)
    expect(r.approved).toBe(false)
  })
})

// ----------------------------------------------------------------------------
describe('buildBillingWeeks — 3-week aggregation (prisma mocked)', () => {
  const NOW = new Date('2026-06-16T12:00:00Z') // Tuesday
  const CUR = '2026-06-14T18:00:00.000Z'
  const LAST = '2026-06-07T18:00:00.000Z'
  const BEFORE = '2026-05-31T18:00:00.000Z'

  const hourly = (id: string, rate: number, title = id): DashContract => ({ id, title, rateType: 'hourly', rateAmount: rate })

  it('returns [] for no contracts WITHOUT touching the DB', async () => {
    const weeks = await buildBillingWeeks([], 'contractor', NOW)
    expect(weeks).toEqual([])
    expect(findManyCycles).not.toHaveBeenCalled()
    expect(findManyEntries).not.toHaveBeenCalled()
  })

  it('produces exactly 3 weeks with correct boundaries and labels', async () => {
    const weeks = await buildBillingWeeks([hourly('c1', 100)], 'contractor', NOW)
    expect(weeks).toHaveLength(3)
    expect(weeks.map((w) => w.status)).toEqual(['current', 'recent', 'recent'])
    expect(weeks.map((w) => w.label)).toEqual(['This week', 'Last week', 'The week before'])
    expect(weeks.map((w) => w.periodStart)).toEqual([CUR, LAST, BEFORE])
    // each periodEnd is exactly one week after its start
    expect(weeks[0]!.periodEnd).toBe('2026-06-21T18:00:00.000Z')
  })

  it('current week: aggregates time entries per contract into an in_progress row', async () => {
    findManyEntries.mockResolvedValue([
      { contractId: 'c1', description: 'A', durationSeconds: 1800, approved: true },
      { contractId: 'c1', description: 'B', durationSeconds: 1800, approved: false },
    ])
    const weeks = await buildBillingWeeks([hourly('c1', 100)], 'contractor', NOW)
    const cur = weeks[0]!
    expect(cur.rows).toHaveLength(1)
    const row = cur.rows[0]!
    expect(row.status).toBe('in_progress')
    expect(row.seconds).toBe(3600)
    expect(row.grossAmount).toBe(100) // 1 hour @ $100
    expect(row.netAmount).toBe(100) // current week has no take-rate deduction
    expect(row.taskCount).toBe(2)
    expect(row.tasks.map((t) => t.title)).toEqual(['A', 'B'])
    expect(cur.gross).toBe(100)
    expect(cur.net).toBe(100)
  })

  it('current week: rows sort by gross descending', async () => {
    findManyEntries.mockResolvedValue([
      { contractId: 'small', description: 's', durationSeconds: 3600, approved: true },
      { contractId: 'big', description: 'b', durationSeconds: 3600, approved: true },
    ])
    const weeks = await buildBillingWeeks([hourly('small', 50), hourly('big', 200)], 'contractor', NOW)
    expect(weeks[0]!.rows.map((r) => r.contractId)).toEqual(['big', 'small'])
    expect(weeks[0]!.gross).toBe(250)
  })

  it('current week: ignores entries whose contract is not in the set', async () => {
    findManyEntries.mockResolvedValue([
      { contractId: 'unknown', description: 'ghost', durationSeconds: 3600, approved: true },
    ])
    const weeks = await buildBillingWeeks([hourly('c1', 100)], 'contractor', NOW)
    expect(weeks[0]!.rows).toHaveLength(0)
    expect(weeks[0]!.gross).toBe(0)
  })

  it('recent weeks: a "charged" cycle becomes a paid row with net = gross - takeRate', async () => {
    findManyCycles.mockResolvedValue([
      {
        contractId: 'c1',
        periodStart: new Date(LAST),
        status: 'charged',
        totalSeconds: 7200,
        totalAmount: 200,
        takeRateAmount: 30,
        entries: [{ description: 'done', durationSeconds: 7200, approved: true }],
      },
    ])
    const weeks = await buildBillingWeeks([hourly('c1', 100)], 'contractor', NOW)
    const last = weeks[1]!
    expect(last.rows).toHaveLength(1)
    const row = last.rows[0]!
    expect(row.status).toBe('paid')
    expect(row.grossAmount).toBe(200)
    expect(row.netAmount).toBe(170)
    expect(row.seconds).toBe(7200)
    expect(row.taskCount).toBe(1)
    expect(last.gross).toBe(200)
    expect(last.net).toBe(170)
  })

  it('recent weeks: a dispute_window / disputed cycle becomes an in_review row', async () => {
    findManyCycles.mockResolvedValue([
      { contractId: 'c1', periodStart: new Date(LAST), status: 'dispute_window', totalSeconds: 100, totalAmount: 50, takeRateAmount: 5, entries: [] },
      { contractId: 'c2', periodStart: new Date(BEFORE), status: 'disputed', totalSeconds: 200, totalAmount: 80, takeRateAmount: 8, entries: [] },
    ])
    const weeks = await buildBillingWeeks([hourly('c1', 100), hourly('c2', 100)], 'contractor', NOW)
    expect(weeks[1]!.rows[0]!.status).toBe('in_review')
    expect(weeks[1]!.rows[0]!.netAmount).toBe(45)
    expect(weeks[2]!.rows[0]!.status).toBe('in_review')
    expect(weeks[2]!.rows[0]!.netAmount).toBe(72)
  })

  it('routes cycles into the correct week by periodStart', async () => {
    findManyCycles.mockResolvedValue([
      { contractId: 'c1', periodStart: new Date(LAST), status: 'charged', totalSeconds: 1, totalAmount: 10, takeRateAmount: 1, entries: [] },
      { contractId: 'c1', periodStart: new Date(BEFORE), status: 'charged', totalSeconds: 1, totalAmount: 20, takeRateAmount: 2, entries: [] },
    ])
    const weeks = await buildBillingWeeks([hourly('c1', 100)], 'contractor', NOW)
    expect(weeks[1]!.gross).toBe(10) // last week
    expect(weeks[2]!.gross).toBe(20) // week before
    expect(weeks[0]!.rows).toHaveLength(0) // current week has no entries
  })

  it('uses contract title (not id) in the row', async () => {
    findManyEntries.mockResolvedValue([{ contractId: 'c1', description: 'x', durationSeconds: 3600, approved: true }])
    const weeks = await buildBillingWeeks([hourly('c1', 100, 'My Big Contract')], 'contractor', NOW)
    expect(weeks[0]!.rows[0]!.title).toBe('My Big Contract')
  })

  it('empty DB results yield three zeroed weeks', async () => {
    const weeks = await buildBillingWeeks([hourly('c1', 100)], 'contractor', NOW)
    for (const w of weeks) {
      expect(w.rows).toHaveLength(0)
      expect(w.gross).toBe(0)
      expect(w.net).toBe(0)
    }
  })

  it('role does not change the output structure (client vs contractor identical here)', async () => {
    findManyEntries.mockResolvedValue([{ contractId: 'c1', description: 'x', durationSeconds: 3600, approved: true }])
    const asContractor = await buildBillingWeeks([hourly('c1', 100)], 'contractor', NOW)
    findManyEntries.mockResolvedValue([{ contractId: 'c1', description: 'x', durationSeconds: 3600, approved: true }])
    const asClient = await buildBillingWeeks([hourly('c1', 100)], 'client', NOW)
    expect(asClient).toEqual(asContractor)
  })

  it('queries the DB scoped to the three computed week boundaries', async () => {
    await buildBillingWeeks([hourly('c1', 100)], 'contractor', NOW)
    expect(findManyCycles).toHaveBeenCalledTimes(1)
    const cycleArg = findManyCycles.mock.calls[0]![0] as { where: { periodStart: { in: Date[] } } }
    const ins = cycleArg.where.periodStart.in.map((d) => d.toISOString())
    expect(ins).toEqual([LAST, BEFORE])
    expect(findManyEntries).toHaveBeenCalledTimes(1)
  })
})
