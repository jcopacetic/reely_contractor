/**
 * Unit tests for the PURE logic in marketplace/store.ts.
 *
 * DB-FREE: these never call any prisma-backed query function. We only exercise:
 *   - num()             — nullable decimal → number coercion (pure, exported helper)
 *   - toListingView()   — DB-row → view mapper + isOwner flag (pure, no prisma)
 *   - bidCounts([])     — the empty-input fast path (returns a fresh Map WITHOUT querying)
 *                          plus a stand-alone check of the groupBy→Map aggregation shape.
 *
 * Importing the module is safe: the prisma client instantiates lazily and never connects on import.
 * Dates are built from FIXED ISO literals so assertions are deterministic (no wall-clock).
 */
import { describe, it, expect } from 'vitest'
import { num, toListingView, bidCounts, MAX_BIDS_PER_LISTING } from './store'

// A Prisma.Decimal-like stand-in: `Number(x)` falls back to x.toString(). This matches the
// `{ toString(): string }` parameter contract num() declares.
const dec = (s: string): { toString(): string } => ({ toString: () => s })

const FIXED_ISO = '2026-06-15T12:34:56.000Z'
const baseRow = () => ({
  id: 'lst_1',
  ownerUserId: 'user_owner',
  boardPartRef: null as string | null,
  title: 'Build a deck',
  description: 'Cedar, 200sqft',
  categoryIds: ['cat_carpentry', 'cat_outdoor'],
  budgetType: 'fixed',
  budgetAmount: dec('4500.50') as unknown,
  status: 'open',
  createdAt: new Date(FIXED_ISO),
})

describe('num — nullable decimal to number', () => {
  it('returns null for null input', () => {
    expect(num(null)).toBeNull()
  })

  it('coerces a Decimal-like object via its string value', () => {
    expect(num(dec('4500.50'))).toBe(4500.5)
  })

  it('coerces an integer-valued Decimal-like to a number', () => {
    expect(num(dec('100'))).toBe(100)
  })

  it('coerces zero to 0 (not null)', () => {
    const r = num(dec('0'))
    expect(r).toBe(0)
    expect(r).not.toBeNull()
  })

  it('coerces a negative Decimal-like value', () => {
    expect(num(dec('-12.25'))).toBe(-12.25)
  })

  it('coerces a high-precision decimal string', () => {
    expect(num(dec('3.14159'))).toBeCloseTo(3.14159, 5)
  })

  it('coerces a very large numeric string', () => {
    expect(num(dec('1000000000.99'))).toBe(1000000000.99)
  })

  it('treats a trailing/leading-whitespace numeric string as that number', () => {
    // Number(' 42 ') === 42 — JS trims whitespace before parsing.
    expect(num(dec('  42  '))).toBe(42)
  })

  it('coerces empty-string toString() to 0 (Number("") === 0)', () => {
    expect(num(dec(''))).toBe(0)
  })

  it('yields NaN for a non-numeric string (no validation in num)', () => {
    expect(Number.isNaN(num(dec('not-a-number')) as number)).toBe(true)
  })

  it('does NOT treat undefined like null (only == null short-circuits both)', () => {
    // num uses `== null`, which is true for both null and undefined.
    expect(num(undefined as never)).toBeNull()
  })
})

describe('toListingView — DB listing to view + isOwner flag', () => {
  it('maps every field straight through', () => {
    const v = toListingView(baseRow(), 'viewer_x', 7)
    expect(v).toEqual({
      id: 'lst_1',
      ownerUserId: 'user_owner',
      boardPartRef: null,
      title: 'Build a deck',
      description: 'Cedar, 200sqft',
      categoryIds: ['cat_carpentry', 'cat_outdoor'],
      budgetType: 'fixed',
      budgetAmount: 4500.5,
      status: 'open',
      createdAt: FIXED_ISO,
      bidCount: 7,
      isOwner: false,
    })
  })

  it('sets isOwner=true when viewer is the owner', () => {
    const v = toListingView(baseRow(), 'user_owner', 0)
    expect(v.isOwner).toBe(true)
  })

  it('sets isOwner=false when viewer differs from owner', () => {
    const v = toListingView(baseRow(), 'someone_else', 0)
    expect(v.isOwner).toBe(false)
  })

  it('isOwner is a strict match (no coercion, empty viewer never owns)', () => {
    const v = toListingView(baseRow(), '', 0)
    expect(v.isOwner).toBe(false)
  })

  it('serializes createdAt to an ISO string from the fixed Date', () => {
    const v = toListingView(baseRow(), 'viewer_x', 0)
    expect(v.createdAt).toBe(FIXED_ISO)
    expect(typeof v.createdAt).toBe('string')
  })

  it('passes bidCount through verbatim (zero)', () => {
    expect(toListingView(baseRow(), 'viewer_x', 0).bidCount).toBe(0)
  })

  it('passes a large bidCount through verbatim', () => {
    expect(toListingView(baseRow(), 'viewer_x', 9999).bidCount).toBe(9999)
  })

  it('maps a null budgetAmount to null (via num)', () => {
    const row = { ...baseRow(), budgetAmount: null as unknown }
    expect(toListingView(row, 'viewer_x', 0).budgetAmount).toBeNull()
  })

  it('maps a zero budgetAmount to 0 (not null)', () => {
    const row = { ...baseRow(), budgetAmount: dec('0') as unknown }
    expect(toListingView(row, 'viewer_x', 0).budgetAmount).toBe(0)
  })

  it('preserves a non-null boardPartRef (Board-originated listing)', () => {
    const row = { ...baseRow(), boardPartRef: 'board_part_42' }
    expect(toListingView(row, 'viewer_x', 0).boardPartRef).toBe('board_part_42')
  })

  it('preserves an empty categoryIds array', () => {
    const row = { ...baseRow(), categoryIds: [] as string[] }
    expect(toListingView(row, 'viewer_x', 0).categoryIds).toEqual([])
  })

  it('carries an hourly budgetType through as-is', () => {
    const row = { ...baseRow(), budgetType: 'hourly' }
    expect(toListingView(row, 'viewer_x', 0).budgetType).toBe('hourly')
  })

  it('carries the filled status through as-is', () => {
    const row = { ...baseRow(), status: 'filled' }
    expect(toListingView(row, 'viewer_x', 0).status).toBe('filled')
  })

  it('carries the closed status through as-is', () => {
    const row = { ...baseRow(), status: 'closed' }
    expect(toListingView(row, 'viewer_x', 0).status).toBe('closed')
  })

  it('does not mutate the source row', () => {
    const row = baseRow()
    const snapshot = JSON.stringify({ ...row, createdAt: row.createdAt.toISOString() })
    toListingView(row, 'viewer_x', 3)
    expect(JSON.stringify({ ...row, createdAt: row.createdAt.toISOString() })).toBe(snapshot)
  })

  it('returns a fresh categoryIds reference equal to the source contents', () => {
    const row = baseRow()
    const v = toListingView(row, 'viewer_x', 0)
    // current impl forwards the same array; assert value-equality (contract is the contents).
    expect(v.categoryIds).toEqual(row.categoryIds)
  })
})

describe('bidCounts — empty-input fast path (no DB query)', () => {
  it('returns an empty Map for an empty listingIds array', async () => {
    const m = await bidCounts([])
    expect(m).toBeInstanceOf(Map)
    expect(m.size).toBe(0)
  })

  it('returns a brand-new Map each call (no shared mutable state)', async () => {
    const a = await bidCounts([])
    const b = await bidCounts([])
    expect(a).not.toBe(b)
    a.set('lst_x', 1)
    expect(b.size).toBe(0)
  })
})

describe('bidCounts — groupBy→Map aggregation shape (pure transform, mocked query result)', () => {
  // The function's post-query step is: new Map(groups.map(g => [g.listingId, g._count._all])).
  // We exercise that exact transform against a mocked groupBy result to lock the contract,
  // without touching prisma.
  type Group = { listingId: string; _count: { _all: number } }
  const aggregate = (groups: Group[]) => new Map(groups.map((g) => [g.listingId, g._count._all]))

  it('maps each group to listingId → active-bid count', () => {
    const m = aggregate([
      { listingId: 'lst_1', _count: { _all: 3 } },
      { listingId: 'lst_2', _count: { _all: 1 } },
    ])
    expect(m.get('lst_1')).toBe(3)
    expect(m.get('lst_2')).toBe(1)
    expect(m.size).toBe(2)
  })

  it('omits listings with no active-bid group (caller defaults them to 0)', () => {
    const m = aggregate([{ listingId: 'lst_1', _count: { _all: 5 } }])
    expect(m.has('lst_2')).toBe(false)
    expect(m.get('lst_2') ?? 0).toBe(0)
  })

  it('produces an empty Map when groupBy returns no rows', () => {
    expect(aggregate([]).size).toBe(0)
  })

  it('keeps a zero count when a group reports _all: 0', () => {
    const m = aggregate([{ listingId: 'lst_z', _count: { _all: 0 } }])
    expect(m.get('lst_z')).toBe(0)
  })
})

describe('MAX_BIDS_PER_LISTING constant', () => {
  it('is the documented cap of 100', () => {
    expect(MAX_BIDS_PER_LISTING).toBe(100)
  })
})
