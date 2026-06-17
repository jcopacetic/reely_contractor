import { describe, it, expect } from 'vitest'
import { sanitizeItems, ttdOf, applyApprovals, toView } from './store'

// Pure-logic unit tests for the sprint store (no DB). These cover the four pure helpers that the
// (DB-backed) handlers compose: input sanitization, time-to-deliver clamping, the two-party
// counter-edit approval derivation, and the DB→view mapper incl. expectedHours/expectedBudget.
// Determinism: every Date is built from a FIXED ISO string literal — never the wall clock.

// ── sanitizeItems ────────────────────────────────────────────────────────────
describe('sanitizeItems — parse / trim / bounds-check', () => {
  it('returns [] for non-array input (undefined, null, object, string, number)', () => {
    expect(sanitizeItems(undefined)).toEqual([])
    expect(sanitizeItems(null)).toEqual([])
    expect(sanitizeItems({})).toEqual([])
    expect(sanitizeItems('not-an-array')).toEqual([])
    expect(sanitizeItems(42)).toEqual([])
  })

  it('returns [] for an empty array', () => {
    expect(sanitizeItems([])).toEqual([])
  })

  it('passes a clean item through unchanged', () => {
    expect(sanitizeItems([{ title: 'Build login', effortPoints: 8 }])).toEqual([
      { title: 'Build login', effortPoints: 8 },
    ])
  })

  it('trims surrounding whitespace on the title', () => {
    expect(sanitizeItems([{ title: '  spaced  ', effortPoints: 1 }])).toEqual([
      { title: 'spaced', effortPoints: 1 },
    ])
  })

  it('truncates the title to 200 chars (after trim)', () => {
    const long = 'x'.repeat(250)
    const [item] = sanitizeItems([{ title: long, effortPoints: 1 }])
    expect(item!.title).toHaveLength(200)
    expect(item!.title).toBe('x'.repeat(200))
  })

  it('drops items whose title is empty or whitespace-only', () => {
    expect(
      sanitizeItems([
        { title: '', effortPoints: 5 },
        { title: '   ', effortPoints: 5 },
        { title: 'kept', effortPoints: 5 },
      ]),
    ).toEqual([{ title: 'kept', effortPoints: 5 }])
  })

  it('drops an item with a missing title (treated as empty)', () => {
    expect(sanitizeItems([{ effortPoints: 3 }])).toEqual([])
  })

  it('coerces a non-string title via String() then trims', () => {
    // Number title 123 → "123"; object/array titles still stringify to non-empty.
    expect(sanitizeItems([{ title: 123, effortPoints: 2 }])).toEqual([
      { title: '123', effortPoints: 2 },
    ])
  })

  it('rounds fractional effort points to the nearest integer', () => {
    expect(sanitizeItems([{ title: 'a', effortPoints: 2.4 }])[0]!.effortPoints).toBe(2)
    expect(sanitizeItems([{ title: 'b', effortPoints: 2.5 }])[0]!.effortPoints).toBe(3)
    expect(sanitizeItems([{ title: 'c', effortPoints: 2.6 }])[0]!.effortPoints).toBe(3)
  })

  it('defaults missing effortPoints to 0', () => {
    expect(sanitizeItems([{ title: 'a' }])).toEqual([{ title: 'a', effortPoints: 0 }])
  })

  it('clamps negative effort points up to 0', () => {
    expect(sanitizeItems([{ title: 'a', effortPoints: -10 }])[0]!.effortPoints).toBe(0)
  })

  it('clamps effort points above the 1000 ceiling', () => {
    expect(sanitizeItems([{ title: 'a', effortPoints: 5000 }])[0]!.effortPoints).toBe(1000)
    expect(sanitizeItems([{ title: 'a', effortPoints: 1000 }])[0]!.effortPoints).toBe(1000)
    expect(sanitizeItems([{ title: 'a', effortPoints: 1001 }])[0]!.effortPoints).toBe(1000)
  })

  it('coerces a numeric-string effortPoints', () => {
    expect(sanitizeItems([{ title: 'a', effortPoints: '7' }])[0]!.effortPoints).toBe(7)
  })

  it('treats a non-numeric / NaN effortPoints as 0', () => {
    // Number('abc') → NaN → Math.round(NaN) → NaN → Number.isFinite(false) → 0
    expect(sanitizeItems([{ title: 'a', effortPoints: 'abc' }])[0]!.effortPoints).toBe(0)
    expect(sanitizeItems([{ title: 'a', effortPoints: NaN }])[0]!.effortPoints).toBe(0)
  })

  it('treats Infinity effortPoints as 0 (not finite after rounding)', () => {
    expect(sanitizeItems([{ title: 'a', effortPoints: Infinity }])[0]!.effortPoints).toBe(0)
  })

  it('caps the list at 50 items (MAX_ITEMS)', () => {
    const raw = Array.from({ length: 75 }, (_, i) => ({ title: `t${i}`, effortPoints: 1 }))
    const out = sanitizeItems(raw)
    expect(out).toHaveLength(50)
    expect(out[0]!.title).toBe('t0')
    expect(out[49]!.title).toBe('t49')
  })

  it('caps to 50 AFTER dropping invalid items (interleaved valid/invalid)', () => {
    // 60 valid + 60 invalid interleaved → 60 valid survive the filter → sliced to 50.
    const raw: unknown[] = []
    for (let i = 0; i < 60; i++) {
      raw.push({ title: `v${i}`, effortPoints: 1 })
      raw.push({ title: '', effortPoints: 1 })
    }
    const out = sanitizeItems(raw)
    expect(out).toHaveLength(50)
    expect(out.every((x) => x.title.startsWith('v'))).toBe(true)
    expect(out[0]!.title).toBe('v0')
  })

  it('handles a mix of clean, dirty, and droppable items together', () => {
    expect(
      sanitizeItems([
        { title: '  Design  ', effortPoints: 3.5 },
        { title: '', effortPoints: 99 },
        { title: 'Test', effortPoints: -2 },
        { title: 'Ship', effortPoints: 2000 },
      ]),
    ).toEqual([
      { title: 'Design', effortPoints: 4 },
      { title: 'Test', effortPoints: 0 },
      { title: 'Ship', effortPoints: 1000 },
    ])
  })
})

// ── ttdOf ────────────────────────────────────────────────────────────────────
describe('ttdOf — clamp time-to-deliver to 1..365', () => {
  it('passes a mid-range value through (rounded)', () => {
    expect(ttdOf(30)).toBe(30)
  })

  it('clamps the lower bound up to 1 (zero and negatives)', () => {
    expect(ttdOf(1)).toBe(1)
    expect(ttdOf(0)).toBe(1)
    expect(ttdOf(-5)).toBe(1)
    expect(ttdOf(-1000)).toBe(1)
  })

  it('clamps the upper bound down to 365', () => {
    expect(ttdOf(365)).toBe(365)
    expect(ttdOf(366)).toBe(365)
    expect(ttdOf(99999)).toBe(365)
  })

  it('rounds before clamping', () => {
    expect(ttdOf(30.4)).toBe(30)
    expect(ttdOf(30.5)).toBe(31)
    expect(ttdOf(0.4)).toBe(1) // rounds to 0 then clamps up to 1
    expect(ttdOf(0.6)).toBe(1)
    expect(ttdOf(364.6)).toBe(365)
    expect(ttdOf(365.4)).toBe(365) // rounds to 365
  })

  it('NaN propagates through the clamp (Math.max/min with NaN → NaN)', () => {
    // Documents the actual behavior: Math.max(1, Math.min(365, NaN)) → Math.max(1, NaN) → NaN.
    // Upstream callers sanitize/validate ttdDays before this is reached, so NaN never arrives in practice.
    expect(ttdOf(NaN)).toBeNaN()
  })

  it('clamps Infinity to 365 and -Infinity to 1', () => {
    expect(ttdOf(Infinity)).toBe(365)
    expect(ttdOf(-Infinity)).toBe(1)
  })
})

// ── applyApprovals ───────────────────────────────────────────────────────────
describe('applyApprovals — two-party counter-edit derivation', () => {
  it('contractor acting → contractor approved, client reset', () => {
    expect(applyApprovals('contractor')).toEqual({ contractorApproved: true, clientApproved: false })
  })

  it('client acting → client approved, contractor reset', () => {
    expect(applyApprovals('client')).toEqual({ clientApproved: true, contractorApproved: false })
  })

  it('always un-approves the OTHER side (mutual exclusion)', () => {
    const c = applyApprovals('contractor')
    expect(c.contractorApproved).toBe(true)
    expect(c.clientApproved).toBe(false)
    const cl = applyApprovals('client')
    expect(cl.clientApproved).toBe(true)
    expect(cl.contractorApproved).toBe(false)
  })

  it('the acting side is never the un-approved side (no role both-true / both-false)', () => {
    for (const role of ['client', 'contractor'] as const) {
      const a = applyApprovals(role)
      expect(a.clientApproved).not.toBe(a.contractorApproved)
    }
  })
})

// ── toView ───────────────────────────────────────────────────────────────────
// A fixed reference instant for every Date in these tests — keeps ISO assertions deterministic.
const T = (iso: string) => new Date(iso)
const CREATED = '2026-01-02T03:04:05.000Z'

type Row = Parameters<typeof toView>[0]
function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 's1',
    status: 'proposed',
    ttdDays: 14,
    items: [{ title: 'A', effortPoints: 2 }],
    clientApproved: false,
    contractorApproved: false,
    lastEditedByRole: 'contractor',
    submittedAt: null,
    reviewDueAt: null,
    acceptedAt: null,
    autoAccepted: false,
    submissionNote: null,
    changeRequestNote: null,
    createdAt: T(CREATED),
    agreedAt: null,
    ...overrides,
  }
}

describe('toView — DB → view mapping', () => {
  it('maps scalar fields straight through', () => {
    const v = toView(row({ id: 'abc', status: 'agreed', ttdDays: 7 }), 'client', 'hourly', 100)
    expect(v.id).toBe('abc')
    expect(v.status).toBe('agreed')
    expect(v.ttdDays).toBe(7)
    expect(v.myRole).toBe('client')
  })

  it('sanitizes items on the way out (drops empties, clamps points)', () => {
    const v = toView(
      row({ items: [{ title: '  keep  ', effortPoints: 1.6 }, { title: '', effortPoints: 9 }] }),
      'contractor',
      'fixed',
      0,
    )
    expect(v.items).toEqual([{ title: 'keep', effortPoints: 2 }])
  })

  it('sums effortPoints into expectedHours', () => {
    const v = toView(
      row({ items: [{ title: 'a', effortPoints: 3 }, { title: 'b', effortPoints: 5 }] }),
      'client',
      'fixed',
      0,
    )
    expect(v.expectedHours).toBe(8)
  })

  it('expectedHours is 0 when there are no valid items', () => {
    const v = toView(row({ items: [] }), 'client', 'hourly', 50)
    expect(v.expectedHours).toBe(0)
    expect(v.expectedBudget).toBe(0)
  })

  it('handles non-array items JSON as empty', () => {
    const v = toView(row({ items: 'corrupt' as unknown }), 'client', 'hourly', 50)
    expect(v.items).toEqual([])
    expect(v.expectedHours).toBe(0)
  })

  it('hourly contract → expectedBudget = Σhours × rate', () => {
    const v = toView(
      row({ items: [{ title: 'a', effortPoints: 4 }, { title: 'b', effortPoints: 6 }] }),
      'client',
      'hourly',
      150,
    )
    expect(v.expectedHours).toBe(10)
    expect(v.expectedBudget).toBe(1500)
  })

  it('fixed-rate contract → expectedBudget is null regardless of hours', () => {
    const v = toView(
      row({ items: [{ title: 'a', effortPoints: 10 }] }),
      'contractor',
      'fixed',
      999,
    )
    expect(v.expectedBudget).toBeNull()
  })

  it('any non-"hourly" rateType yields a null budget', () => {
    expect(toView(row(), 'client', 'milestone', 100).expectedBudget).toBeNull()
    expect(toView(row(), 'client', '', 100).expectedBudget).toBeNull()
  })

  it('rounds expectedBudget to 2 decimal places (cents)', () => {
    // 3 hours × 33.333 = 99.999 → 100.00
    const v = toView(row({ items: [{ title: 'a', effortPoints: 3 }] }), 'client', 'hourly', 33.333)
    expect(v.expectedBudget).toBe(100)
  })

  it('preserves a fractional budget that lands on exact cents', () => {
    // 2 hours × 12.5 = 25
    const v = toView(row({ items: [{ title: 'a', effortPoints: 2 }] }), 'client', 'hourly', 12.5)
    expect(v.expectedBudget).toBe(25)
  })

  it('rounds a tricky cent value correctly', () => {
    // 1 hour × 10.005 = 10.005 → round(1000.5)/100 = 10.01
    const v = toView(row({ items: [{ title: 'a', effortPoints: 1 }] }), 'client', 'hourly', 10.005)
    expect(v.expectedBudget).toBe(10.01)
  })

  it('a zero rate gives a zero hourly budget (not null)', () => {
    const v = toView(row({ items: [{ title: 'a', effortPoints: 5 }] }), 'client', 'hourly', 0)
    expect(v.expectedBudget).toBe(0)
  })

  it('serializes createdAt to an ISO string', () => {
    expect(toView(row(), 'client', 'fixed', 0).createdAt).toBe('2026-01-02T03:04:05.000Z')
  })

  it('nullable date fields are null when absent', () => {
    const v = toView(row(), 'client', 'fixed', 0)
    expect(v.submittedAt).toBeNull()
    expect(v.reviewDueAt).toBeNull()
    expect(v.acceptedAt).toBeNull()
    expect(v.agreedAt).toBeNull()
  })

  it('serializes each present date field to ISO', () => {
    const v = toView(
      row({
        submittedAt: T('2026-02-01T00:00:00.000Z'),
        reviewDueAt: T('2026-02-06T00:00:00.000Z'),
        acceptedAt: T('2026-02-07T12:30:00.000Z'),
        agreedAt: T('2026-01-15T08:00:00.000Z'),
      }),
      'client',
      'fixed',
      0,
    )
    expect(v.submittedAt).toBe('2026-02-01T00:00:00.000Z')
    expect(v.reviewDueAt).toBe('2026-02-06T00:00:00.000Z')
    expect(v.acceptedAt).toBe('2026-02-07T12:30:00.000Z')
    expect(v.agreedAt).toBe('2026-01-15T08:00:00.000Z')
  })

  it('passes approval / role / note / flag fields through verbatim', () => {
    const v = toView(
      row({
        clientApproved: true,
        contractorApproved: false,
        lastEditedByRole: 'client',
        autoAccepted: true,
        submissionNote: 'delivered',
        changeRequestNote: 'please fix',
      }),
      'contractor',
      'fixed',
      0,
    )
    expect(v.clientApproved).toBe(true)
    expect(v.contractorApproved).toBe(false)
    expect(v.lastEditedByRole).toBe('client')
    expect(v.autoAccepted).toBe(true)
    expect(v.submissionNote).toBe('delivered')
    expect(v.changeRequestNote).toBe('please fix')
    expect(v.myRole).toBe('contractor')
  })

  it('myRole is independent of lastEditedByRole', () => {
    const v = toView(row({ lastEditedByRole: 'contractor' }), 'client', 'fixed', 0)
    expect(v.lastEditedByRole).toBe('contractor')
    expect(v.myRole).toBe('client')
  })
})
