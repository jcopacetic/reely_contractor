import { describe, expect, it } from 'vitest'
import { __test__ } from './store'

/**
 * Pure-logic unit tests for the change-request store (DB-free). Importing the module is fine — the prisma
 * client instantiates lazily — but we only ever call the pure helpers exposed via `__test__`, never any
 * function that queries prisma or emits. All timestamps are built from FIXED ISO literals for determinism.
 */
const { clean, applyApprovals, toView } = __test__

// Minimal valid input factory — override fields per case.
function input(over: Partial<Parameters<typeof clean>[0]> = {}): Parameters<typeof clean>[0] {
  return { kind: 'scope', title: 'A title', detail: 'A detail', ...over }
}

describe('clean(input) — normalize a change request', () => {
  describe('kind extraction', () => {
    it.each(['scope', 'rate', 'timeline', 'other'] as const)('keeps the valid kind %s', (kind) => {
      // rate needs the rate fields to survive the rate branch
      const res = clean(input({ kind, proposedRateType: 'hourly', proposedRateAmount: 10 }))
      expect('error' in res).toBe(false)
      if ('error' in res) return
      expect(res.kind).toBe(kind)
    })

    it('coerces an unknown kind to "other"', () => {
      const res = clean(input({ kind: 'bogus' as never }))
      expect('error' in res).toBe(false)
      if ('error' in res) return
      expect(res.kind).toBe('other')
    })

    it('coerces undefined kind to "other"', () => {
      const res = clean(input({ kind: undefined as never }))
      if ('error' in res) throw new Error('unexpected error')
      expect(res.kind).toBe('other')
    })
  })

  describe('text sanitization', () => {
    it('trims surrounding whitespace from title and detail', () => {
      const res = clean(input({ title: '  hello  ', detail: '\t world \n' }))
      if ('error' in res) throw new Error('unexpected error')
      expect(res.title).toBe('hello')
      expect(res.detail).toBe('world')
    })

    it('caps title at 200 chars and detail at 4000 chars', () => {
      const res = clean(input({ title: 'a'.repeat(250), detail: 'b'.repeat(5000) }))
      if ('error' in res) throw new Error('unexpected error')
      expect(res.title).toHaveLength(200)
      expect(res.detail).toHaveLength(4000)
    })

    it('keeps title/detail at exactly the boundary length (200 / 4000)', () => {
      const res = clean(input({ title: 'a'.repeat(200), detail: 'b'.repeat(4000) }))
      if ('error' in res) throw new Error('unexpected error')
      expect(res.title).toHaveLength(200)
      expect(res.detail).toHaveLength(4000)
    })

    it('coerces non-string title/detail via String() before trimming', () => {
      const res = clean(input({ title: 12345 as never, detail: 678 as never }))
      if ('error' in res) throw new Error('unexpected error')
      expect(res.title).toBe('12345')
      expect(res.detail).toBe('678')
    })

    it('treats null/undefined title or detail as empty → "incomplete"', () => {
      expect(clean(input({ title: null as never }))).toEqual({ error: 'incomplete' })
      expect(clean(input({ detail: undefined as never }))).toEqual({ error: 'incomplete' })
    })

    it('returns "incomplete" when title is empty or whitespace-only', () => {
      expect(clean(input({ title: '' }))).toEqual({ error: 'incomplete' })
      expect(clean(input({ title: '   ' }))).toEqual({ error: 'incomplete' })
    })

    it('returns "incomplete" when detail is empty or whitespace-only', () => {
      expect(clean(input({ detail: '' }))).toEqual({ error: 'incomplete' })
      expect(clean(input({ detail: '  \t ' }))).toEqual({ error: 'incomplete' })
    })
  })

  describe('non-rate kinds drop rate fields', () => {
    it.each(['scope', 'timeline', 'other'] as const)('nulls proposedRate* for kind %s even if supplied', (kind) => {
      const res = clean(input({ kind, proposedRateType: 'hourly', proposedRateAmount: 99 }))
      if ('error' in res) throw new Error('unexpected error')
      expect(res.proposedRateType).toBeNull()
      expect(res.proposedRateAmount).toBeNull()
    })
  })

  describe('rate kind validation + normalization', () => {
    it('accepts a valid hourly rate', () => {
      const res = clean(input({ kind: 'rate', proposedRateType: 'hourly', proposedRateAmount: 125 }))
      if ('error' in res) throw new Error('unexpected error')
      expect(res.proposedRateType).toBe('hourly')
      expect(res.proposedRateAmount).toBe(125)
    })

    it('accepts a valid fixed rate', () => {
      const res = clean(input({ kind: 'rate', proposedRateType: 'fixed', proposedRateAmount: 5000 }))
      if ('error' in res) throw new Error('unexpected error')
      expect(res.proposedRateType).toBe('fixed')
      expect(res.proposedRateAmount).toBe(5000)
    })

    it('rounds the amount to 2 decimals (half-up)', () => {
      const res = clean(input({ kind: 'rate', proposedRateType: 'hourly', proposedRateAmount: 10.005 }))
      if ('error' in res) throw new Error('unexpected error')
      expect(res.proposedRateAmount).toBe(10.01)
    })

    it('rounds a long-fraction amount down when below the half', () => {
      const res = clean(input({ kind: 'rate', proposedRateType: 'hourly', proposedRateAmount: 33.33333 }))
      if ('error' in res) throw new Error('unexpected error')
      expect(res.proposedRateAmount).toBe(33.33)
    })

    it('leaves an already-2dp amount unchanged', () => {
      const res = clean(input({ kind: 'rate', proposedRateType: 'fixed', proposedRateAmount: 42.5 }))
      if ('error' in res) throw new Error('unexpected error')
      expect(res.proposedRateAmount).toBe(42.5)
    })

    it('coerces a numeric string amount', () => {
      const res = clean(input({ kind: 'rate', proposedRateType: 'hourly', proposedRateAmount: '49.999' as never }))
      if ('error' in res) throw new Error('unexpected error')
      expect(res.proposedRateAmount).toBe(50)
    })

    it('rejects when proposedRateType is missing/null', () => {
      expect(clean(input({ kind: 'rate', proposedRateType: null, proposedRateAmount: 10 }))).toEqual({ error: 'rate_required' })
      expect(clean(input({ kind: 'rate', proposedRateAmount: 10 }))).toEqual({ error: 'rate_required' })
    })

    it('rejects an invalid proposedRateType value', () => {
      expect(clean(input({ kind: 'rate', proposedRateType: 'monthly' as never, proposedRateAmount: 10 }))).toEqual({ error: 'rate_required' })
    })

    it('rejects a zero amount', () => {
      expect(clean(input({ kind: 'rate', proposedRateType: 'hourly', proposedRateAmount: 0 }))).toEqual({ error: 'rate_required' })
    })

    it('rejects a negative amount', () => {
      expect(clean(input({ kind: 'rate', proposedRateType: 'fixed', proposedRateAmount: -5 }))).toEqual({ error: 'rate_required' })
    })

    it('rejects a non-finite amount (NaN / missing)', () => {
      expect(clean(input({ kind: 'rate', proposedRateType: 'hourly', proposedRateAmount: null }))).toEqual({ error: 'rate_required' })
      expect(clean(input({ kind: 'rate', proposedRateType: 'hourly', proposedRateAmount: 'abc' as never }))).toEqual({ error: 'rate_required' })
      expect(clean(input({ kind: 'rate', proposedRateType: 'hourly', proposedRateAmount: Infinity }))).toEqual({ error: 'rate_required' })
    })

    it('checks title/detail completeness before the rate branch', () => {
      // empty title short-circuits to incomplete even for a rate kind
      expect(clean(input({ kind: 'rate', title: '', proposedRateType: 'hourly', proposedRateAmount: 10 }))).toEqual({ error: 'incomplete' })
    })
  })
})

describe('applyApprovals(role) — two-party approval reset', () => {
  it('contractor approves their version, client must re-approve', () => {
    expect(applyApprovals('contractor')).toEqual({ contractorApproved: true, clientApproved: false })
  })

  it('client approves their version, contractor must re-approve', () => {
    expect(applyApprovals('client')).toEqual({ clientApproved: true, contractorApproved: false })
  })

  it('always sets exactly the acting role to true and the other to false', () => {
    for (const role of ['client', 'contractor'] as const) {
      const r = applyApprovals(role)
      expect(r.clientApproved).toBe(role === 'client')
      expect(r.contractorApproved).toBe(role === 'contractor')
    }
  })
})

describe('toView(c, myRole) — map a DB row to the view shape', () => {
  const CREATED = '2026-01-02T03:04:05.000Z'
  const AGREED = '2026-02-03T04:05:06.000Z'
  const APPLIED = '2026-03-04T05:06:07.000Z'

  // A fully-populated DB-shaped row (Dates as real Date objects, Decimal stubbed as a Number-coercible object).
  function row(over: Record<string, unknown> = {}) {
    return {
      id: 'cr_1',
      kind: 'rate',
      title: 'Bump rate',
      detail: 'New terms',
      proposedRateType: 'hourly',
      proposedRateAmount: { toString: () => '125.5', valueOf: () => 125.5 } as never,
      status: 'proposed',
      clientApproved: false,
      contractorApproved: true,
      lastEditedByRole: 'contractor',
      appliedAt: null as Date | null,
      createdAt: new Date(CREATED),
      agreedAt: null as Date | null,
      ...over,
    }
  }

  it('maps all scalar fields through and stamps myRole', () => {
    const v = toView(row() as never, 'client')
    expect(v).toMatchObject({
      id: 'cr_1',
      kind: 'rate',
      title: 'Bump rate',
      detail: 'New terms',
      proposedRateType: 'hourly',
      status: 'proposed',
      clientApproved: false,
      contractorApproved: true,
      lastEditedByRole: 'contractor',
      myRole: 'client',
    })
  })

  it('converts a Decimal proposedRateAmount to a number', () => {
    const v = toView(row() as never, 'contractor')
    expect(v.proposedRateAmount).toBe(125.5)
    expect(typeof v.proposedRateAmount).toBe('number')
  })

  it('passes null proposedRateType / proposedRateAmount through as null', () => {
    const v = toView(row({ proposedRateType: null, proposedRateAmount: null }) as never, 'client')
    expect(v.proposedRateType).toBeNull()
    expect(v.proposedRateAmount).toBeNull()
  })

  it('treats a zero Decimal amount as 0 (not null)', () => {
    const v = toView(row({ proposedRateAmount: { valueOf: () => 0 } as never }) as never, 'client')
    expect(v.proposedRateAmount).toBe(0)
  })

  it('serializes createdAt to an ISO string', () => {
    const v = toView(row() as never, 'client')
    expect(v.createdAt).toBe(CREATED)
  })

  it('serializes appliedAt / agreedAt to ISO strings when present', () => {
    const v = toView(row({ appliedAt: new Date(APPLIED), agreedAt: new Date(AGREED) }) as never, 'contractor')
    expect(v.appliedAt).toBe(APPLIED)
    expect(v.agreedAt).toBe(AGREED)
  })

  it('keeps appliedAt / agreedAt null when absent', () => {
    const v = toView(row() as never, 'client')
    expect(v.appliedAt).toBeNull()
    expect(v.agreedAt).toBeNull()
  })

  it('preserves the viewer role for both sides', () => {
    expect(toView(row() as never, 'client').myRole).toBe('client')
    expect(toView(row() as never, 'contractor').myRole).toBe('contractor')
  })
})
