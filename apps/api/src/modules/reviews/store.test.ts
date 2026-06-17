import { describe, expect, it } from 'vitest'
import { asDimensions, type ReviewRow, toView, trimBody, weekStart } from './store'

/**
 * Pure-logic unit tests for the reviews store. NO database is touched here: `trimBody`, `weekStart`,
 * `asDimensions`, and `toView` are pure functions over their arguments. Every Date is built from a fixed ISO
 * string literal for determinism — never the wall clock. (clientCreateWeekly/Final, listForViewer,
 * toggleApproval, publicReviews, provider* all hit prisma and are e2e-covered, so they are not tested here.)
 */

// A complete review row (matches ReviewRow). Helper keeps the tests dense.
const row = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  id: 'r1',
  kind: 'weekly',
  rating: null,
  pulse: null,
  dimensions: null,
  kudos: [],
  body: null,
  authorLabel: null,
  weekOf: null,
  approvedForDisplay: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...over,
})

const dims = (over: Partial<Record<string, number>> = {}) => ({
  communication: 4,
  quality: 5,
  timeliness: 3,
  collaboration: 4,
  ...over,
})

describe('trimBody — trim + cap review body text', () => {
  it('returns null for non-string inputs', () => {
    expect(trimBody(undefined)).toBeNull()
    expect(trimBody(null)).toBeNull()
    expect(trimBody(42)).toBeNull()
    expect(trimBody(0)).toBeNull()
    expect(trimBody(false)).toBeNull()
    expect(trimBody(true)).toBeNull()
    expect(trimBody({})).toBeNull()
    expect(trimBody([])).toBeNull()
    expect(trimBody(['a'])).toBeNull()
  })

  it('returns null for empty string', () => expect(trimBody('')).toBeNull())

  it('returns null for whitespace-only strings (trims to empty)', () => {
    expect(trimBody('   ')).toBeNull()
    expect(trimBody('\t\n  \r')).toBeNull()
  })

  it('trims leading and trailing whitespace', () => {
    expect(trimBody('  hello  ')).toBe('hello')
    expect(trimBody('\n\tgreat work\t\n')).toBe('great work')
  })

  it('preserves interior whitespace and content', () => {
    expect(trimBody('a  b\nc')).toBe('a  b\nc')
  })

  it('returns the string unchanged when within the default 2000 cap', () => {
    const s = 'solid contributor, easy to work with'
    expect(trimBody(s)).toBe(s)
  })

  it('keeps exactly 2000 chars untouched (default-cap boundary)', () => {
    const s = 'x'.repeat(2000)
    const out = trimBody(s)
    expect(out!.length).toBe(2000)
    expect(out).toBe(s)
  })

  it('caps 2001 chars to 2000 (over default cap by one)', () => {
    const out = trimBody('y'.repeat(2001))
    expect(out!.length).toBe(2000)
    expect(out).toBe('y'.repeat(2000))
  })

  it('caps far-over input to the default 2000', () => {
    expect(trimBody('z'.repeat(10_000))!.length).toBe(2000)
  })

  it('honors a custom max (the weekly one-liner uses 280)', () => {
    const out = trimBody('a'.repeat(500), 280)
    expect(out!.length).toBe(280)
    expect(out).toBe('a'.repeat(280))
  })

  it('keeps exactly max chars at a custom boundary', () => {
    expect(trimBody('b'.repeat(280), 280)!.length).toBe(280)
    expect(trimBody('b'.repeat(281), 280)!.length).toBe(280)
  })

  it('returns empty string (not null) for max=0: the null-guard runs on the trimmed text, before the slice', () => {
    // t is truthy ('anything') so the ternary takes the slice branch; slice(0,0) === '' is returned as-is.
    expect(trimBody('anything', 0)).toBe('')
  })

  it('trims BEFORE the cap is applied (leading whitespace does not consume budget)', () => {
    const out = trimBody('     ' + 'a'.repeat(280), 280)
    expect(out!.length).toBe(280)
    expect(out).toBe('a'.repeat(280))
  })

  it('does not re-trim after slicing (a slice landing on whitespace keeps it)', () => {
    const out = trimBody('a'.repeat(279) + ' ' + 'b'.repeat(50), 280)
    expect(out!.length).toBe(280)
    expect(out!.endsWith(' ')).toBe(true)
  })
})

describe('weekStart — Monday 00:00 UTC of the ISO week', () => {
  const ws = (iso: string) => weekStart(new Date(iso)).toISOString()

  it('returns the same Monday at midnight when given a Monday', () => {
    // 2026-01-05 is a Monday.
    expect(ws('2026-01-05T13:37:42.123Z')).toBe('2026-01-05T00:00:00.000Z')
  })

  it('zeroes the time-of-day to 00:00:00.000 UTC', () => {
    const d = weekStart(new Date('2026-01-07T23:59:59.999Z'))
    expect(d.getUTCHours()).toBe(0)
    expect(d.getUTCMinutes()).toBe(0)
    expect(d.getUTCSeconds()).toBe(0)
    expect(d.getUTCMilliseconds()).toBe(0)
  })

  it('rolls a mid-week Wednesday back to that week Monday', () => {
    // 2026-01-07 Wed → Mon 2026-01-05.
    expect(ws('2026-01-07T09:00:00.000Z')).toBe('2026-01-05T00:00:00.000Z')
  })

  it('rolls Sunday back to the PRECEDING Monday (ISO weeks end on Sunday)', () => {
    // 2026-01-11 is a Sunday → its ISO week started Mon 2026-01-05.
    expect(ws('2026-01-11T12:00:00.000Z')).toBe('2026-01-05T00:00:00.000Z')
  })

  it('handles Saturday → preceding Monday', () => {
    // 2026-01-10 Sat → Mon 2026-01-05.
    expect(ws('2026-01-10T00:00:00.000Z')).toBe('2026-01-05T00:00:00.000Z')
  })

  it('maps every day of one ISO week (Mon..Sun) to the same Monday', () => {
    const week = [
      '2026-01-05', // Mon
      '2026-01-06', // Tue
      '2026-01-07', // Wed
      '2026-01-08', // Thu
      '2026-01-09', // Fri
      '2026-01-10', // Sat
      '2026-01-11', // Sun
    ]
    for (const day of week) expect(ws(`${day}T18:00:00.000Z`)).toBe('2026-01-05T00:00:00.000Z')
  })

  it('crosses a month boundary backward (Tue Mar 3 → Mon Mar 2)', () => {
    expect(ws('2026-03-03T08:00:00.000Z')).toBe('2026-03-02T00:00:00.000Z')
  })

  it('crosses a year boundary backward (Fri Jan 1 2027 → Mon Dec 28 2026)', () => {
    // 2027-01-01 is a Friday; its ISO week started Mon 2026-12-28.
    expect(ws('2027-01-01T10:00:00.000Z')).toBe('2026-12-28T00:00:00.000Z')
  })

  it('uses UTC day-of-week, not local — a late-UTC instant still keys to its UTC Monday', () => {
    // 2026-02-23 is a Monday in UTC even at 23:30Z.
    expect(ws('2026-02-23T23:30:00.000Z')).toBe('2026-02-23T00:00:00.000Z')
  })

  it('returns a fresh Date object (not the input)', () => {
    const input = new Date('2026-01-07T09:00:00.000Z')
    const out = weekStart(input)
    expect(out).not.toBe(input)
    expect(input.toISOString()).toBe('2026-01-07T09:00:00.000Z') // input untouched
  })
})

describe('asDimensions — validate dimensions JSON', () => {
  it('returns null for null/undefined/non-object input', () => {
    expect(asDimensions(null)).toBeNull()
    expect(asDimensions('nope' as never)).toBeNull()
    expect(asDimensions(5 as never)).toBeNull()
  })

  it('returns null when a key is missing', () => {
    expect(asDimensions({ communication: 4, quality: 5, timeliness: 3 } as never)).toBeNull()
  })

  it('returns null when a value is out of the 1..5 range', () => {
    expect(asDimensions(dims({ quality: 0 }) as never)).toBeNull()
    expect(asDimensions(dims({ quality: 6 }) as never)).toBeNull()
  })

  it('returns the clean map for a valid input', () => {
    expect(asDimensions(dims() as never)).toEqual({
      communication: 4,
      quality: 5,
      timeliness: 3,
      collaboration: 4,
    })
  })

  it('rounds float values to nearest int (delegates to parseDimensions)', () => {
    expect(asDimensions(dims({ communication: 4.4, timeliness: 2.5 }) as never)).toEqual({
      communication: 4,
      quality: 5,
      timeliness: 3,
      collaboration: 4,
    })
  })

  it('accepts the 1 and 5 boundary values', () => {
    expect(asDimensions(dims({ communication: 1, quality: 5 }) as never)).toEqual({
      communication: 1,
      quality: 5,
      timeliness: 3,
      collaboration: 4,
    })
  })
})

describe('toView — map a DB review row to a view', () => {
  it('serializes createdAt to an ISO string', () => {
    const v = toView(row({ createdAt: new Date('2026-04-05T06:07:08.910Z') }))
    expect(v.createdAt).toBe('2026-04-05T06:07:08.910Z')
  })

  it('serializes weekOf to ISO when present, null when absent', () => {
    expect(toView(row({ weekOf: new Date('2026-01-05T00:00:00.000Z') })).weekOf).toBe('2026-01-05T00:00:00.000Z')
    expect(toView(row({ weekOf: null })).weekOf).toBeNull()
  })

  it('passes id/kind/rating/pulse/body/authorLabel/approvedForDisplay through verbatim', () => {
    const v = toView(
      row({
        id: 'rev-42',
        kind: 'final',
        rating: 4,
        pulse: 'up',
        body: 'fantastic',
        authorLabel: 'Acme Co',
        approvedForDisplay: true,
      }),
    )
    expect(v.id).toBe('rev-42')
    expect(v.kind).toBe('final')
    expect(v.rating).toBe(4)
    expect(v.pulse).toBe('up')
    expect(v.body).toBe('fantastic')
    expect(v.authorLabel).toBe('Acme Co')
    expect(v.approvedForDisplay).toBe(true)
  })

  it('maps dimensions through asDimensions (valid → clean map)', () => {
    const v = toView(row({ kind: 'final', dimensions: dims() }))
    expect(v.dimensions).toEqual({ communication: 4, quality: 5, timeliness: 3, collaboration: 4 })
  })

  it('nulls dimensions when the stored JSON is null or invalid', () => {
    expect(toView(row({ dimensions: null })).dimensions).toBeNull()
    expect(toView(row({ dimensions: { communication: 4 } })).dimensions).toBeNull()
  })

  it('passes kudos through when present', () => {
    expect(toView(row({ kudos: ['fast', 'reliable'] })).kudos).toEqual(['fast', 'reliable'])
  })

  it('coalesces a nullish kudos to an empty array', () => {
    // The DB column is non-null string[], but the ?? guard defends a null leaking through.
    expect(toView(row({ kudos: null as never })).kudos).toEqual([])
    expect(toView(row({ kudos: undefined as never })).kudos).toEqual([])
  })

  it('preserves null rating/pulse/body/authorLabel (weekly defaults)', () => {
    const v = toView(row())
    expect(v.rating).toBeNull()
    expect(v.pulse).toBeNull()
    expect(v.body).toBeNull()
    expect(v.authorLabel).toBeNull()
    expect(v.approvedForDisplay).toBe(false)
  })
})
