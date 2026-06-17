import { describe, it, expect } from 'vitest'
import { toView, type Row, type LedgerView } from './ledger'

// Fixed timestamps — never now-relative. Distinct values so we can assert each field maps independently.
const OCCURRED_ISO = '2026-01-15T08:30:00.000Z'
const PERIOD_START_ISO = '2026-01-01T00:00:00.000Z'
const PERIOD_END_ISO = '2026-01-31T23:59:59.999Z'

/** A fully-populated, "normal" row. Overrides let each test mutate one axis. */
function baseRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'led_1',
    kind: 'charge',
    contractId: 'con_1',
    boardRef: 'board_1',
    grossAmount: 100,
    feeAmount: 10,
    netAmount: 90,
    currency: 'usd',
    description: 'cycle charge',
    periodStart: new Date(PERIOD_START_ISO),
    periodEnd: new Date(PERIOD_END_ISO),
    taskCount: 3,
    totalSeconds: 3600,
    succeeded: true,
    failureReason: null,
    occurredAt: new Date(OCCURRED_ISO),
    ...overrides,
  }
}

describe('toView — straightforward field mapping', () => {
  it('maps every field through to the view shape', () => {
    const v = toView(baseRow())
    expect(v).toEqual<LedgerView>({
      id: 'led_1',
      kind: 'charge',
      contractId: 'con_1',
      boardRef: 'board_1',
      grossAmount: 100,
      feeAmount: 10,
      netAmount: 90,
      currency: 'usd',
      description: 'cycle charge',
      periodStart: PERIOD_START_ISO,
      periodEnd: PERIOD_END_ISO,
      taskCount: 3,
      totalSeconds: 3600,
      succeeded: true,
      failureReason: null,
      occurredAt: OCCURRED_ISO,
    })
  })

  it('passes string identifiers through verbatim', () => {
    const v = toView(baseRow({ id: 'led_xyz', contractId: 'con_abc', boardRef: 'b_99', description: 'A long, weird ✓ description.' }))
    expect(v.id).toBe('led_xyz')
    expect(v.contractId).toBe('con_abc')
    expect(v.boardRef).toBe('b_99')
    expect(v.description).toBe('A long, weird ✓ description.')
  })

  it('passes through an empty-string description and empty id without coercion', () => {
    const v = toView(baseRow({ id: '', description: '' }))
    expect(v.id).toBe('')
    expect(v.description).toBe('')
  })

  it('forwards the currency code unchanged (no normalization)', () => {
    expect(toView(baseRow({ currency: 'eur' })).currency).toBe('eur')
    expect(toView(baseRow({ currency: 'USD' })).currency).toBe('USD')
    expect(toView(baseRow({ currency: '' })).currency).toBe('')
  })
})

describe('toView — kind (string → Kind cast)', () => {
  for (const k of ['charge', 'charge_failed', 'refund', 'chargeback', 'adjustment'] as const) {
    it(`forwards kind "${k}"`, () => {
      expect(toView(baseRow({ kind: k })).kind).toBe(k)
    })
  }

  it('forwards an unexpected kind string unchanged (pure cast, no validation)', () => {
    // The DB column is a string; toView casts but does not validate.
    expect(toView(baseRow({ kind: 'mystery' })).kind).toBe('mystery')
  })
})

describe('toView — nullable references', () => {
  it('preserves null contractId and boardRef', () => {
    const v = toView(baseRow({ contractId: null, boardRef: null }))
    expect(v.contractId).toBeNull()
    expect(v.boardRef).toBeNull()
  })

  it('preserves null failureReason', () => {
    expect(toView(baseRow({ failureReason: null })).failureReason).toBeNull()
  })

  it('forwards a non-null failureReason string', () => {
    expect(toView(baseRow({ succeeded: false, failureReason: 'card_declined' })).failureReason).toBe('card_declined')
  })
})

describe('toView — decimal → number conversion', () => {
  it('converts plain numbers (identity)', () => {
    const v = toView(baseRow({ grossAmount: 1234, feeAmount: 56, netAmount: 1178 }))
    expect(v.grossAmount).toBe(1234)
    expect(v.feeAmount).toBe(56)
    expect(v.netAmount).toBe(1178)
    expect(typeof v.grossAmount).toBe('number')
  })

  it('converts numeric strings (the Prisma Decimal-as-string case)', () => {
    const v = toView(baseRow({ grossAmount: '99.99', feeAmount: '9.99', netAmount: '90.00' }))
    expect(v.grossAmount).toBeCloseTo(99.99, 5)
    expect(v.feeAmount).toBeCloseTo(9.99, 5)
    expect(v.netAmount).toBe(90)
  })

  it('converts a Decimal-like object via Number() (valueOf/toString)', () => {
    // Prisma Decimal coerces through Number() to a JS number.
    const decimalLike = { valueOf: () => 42.5, toString: () => '42.5' }
    const v = toView(baseRow({ grossAmount: decimalLike, feeAmount: decimalLike, netAmount: decimalLike }))
    expect(v.grossAmount).toBe(42.5)
    expect(v.feeAmount).toBe(42.5)
    expect(v.netAmount).toBe(42.5)
  })

  it('handles zero amounts', () => {
    const v = toView(baseRow({ grossAmount: 0, feeAmount: 0, netAmount: 0 }))
    expect(v.grossAmount).toBe(0)
    expect(v.feeAmount).toBe(0)
    expect(v.netAmount).toBe(0)
  })

  it('handles negative amounts (a refund/adjustment row)', () => {
    const v = toView(baseRow({ kind: 'refund', grossAmount: -50, feeAmount: -5, netAmount: -45 }))
    expect(v.grossAmount).toBe(-50)
    expect(v.feeAmount).toBe(-5)
    expect(v.netAmount).toBe(-45)
  })

  it('handles "-0" string (Number("-0") === -0, loosely equal to 0)', () => {
    const v = toView(baseRow({ grossAmount: '-0' }))
    expect(v.grossAmount == 0).toBe(true)
    expect(Object.is(v.grossAmount, -0)).toBe(true)
  })

  it('preserves fractional precision', () => {
    const v = toView(baseRow({ grossAmount: '0.1', feeAmount: '0.2', netAmount: '0.3' }))
    expect(v.grossAmount).toBe(0.1)
    expect(v.feeAmount).toBe(0.2)
    expect(v.netAmount).toBe(0.3)
  })

  it('converts an empty string to 0 (Number("") === 0)', () => {
    expect(toView(baseRow({ grossAmount: '' })).grossAmount).toBe(0)
  })

  it('converts null amount to 0 (Number(null) === 0)', () => {
    expect(toView(baseRow({ grossAmount: null as unknown })).grossAmount).toBe(0)
  })

  it('produces NaN for an unparseable amount string (no clamping/validation)', () => {
    expect(Number.isNaN(toView(baseRow({ grossAmount: 'abc' })).grossAmount)).toBe(true)
  })

  it('handles very large integer amounts', () => {
    const v = toView(baseRow({ grossAmount: 9_007_199_254_740_991 }))
    expect(v.grossAmount).toBe(9_007_199_254_740_991)
  })
})

describe('toView — date → ISO conversion', () => {
  it('serializes occurredAt to a UTC ISO string', () => {
    expect(toView(baseRow()).occurredAt).toBe(OCCURRED_ISO)
  })

  it('serializes periodStart/periodEnd to ISO strings', () => {
    const v = toView(baseRow())
    expect(v.periodStart).toBe(PERIOD_START_ISO)
    expect(v.periodEnd).toBe(PERIOD_END_ISO)
  })

  it('returns null for a null periodStart', () => {
    expect(toView(baseRow({ periodStart: null })).periodStart).toBeNull()
  })

  it('returns null for a null periodEnd', () => {
    expect(toView(baseRow({ periodEnd: null })).periodEnd).toBeNull()
  })

  it('returns null for both periods when both are null but still serializes occurredAt', () => {
    const v = toView(baseRow({ periodStart: null, periodEnd: null }))
    expect(v.periodStart).toBeNull()
    expect(v.periodEnd).toBeNull()
    expect(v.occurredAt).toBe(OCCURRED_ISO)
  })

  it('normalizes a non-UTC Date construction to the same UTC instant', () => {
    // Build from an offset ISO; toISOString always emits UTC (Z).
    const v = toView(baseRow({ occurredAt: new Date('2026-03-01T12:00:00+02:00') }))
    expect(v.occurredAt).toBe('2026-03-01T10:00:00.000Z')
  })

  it('serializes the unix epoch correctly', () => {
    expect(toView(baseRow({ occurredAt: new Date(0) })).occurredAt).toBe('1970-01-01T00:00:00.000Z')
  })
})

describe('toView — booleans and counts', () => {
  it('forwards succeeded=true', () => {
    expect(toView(baseRow({ succeeded: true })).succeeded).toBe(true)
  })

  it('forwards succeeded=false', () => {
    expect(toView(baseRow({ succeeded: false })).succeeded).toBe(false)
  })

  it('forwards taskCount and totalSeconds verbatim', () => {
    const v = toView(baseRow({ taskCount: 7, totalSeconds: 12_345 }))
    expect(v.taskCount).toBe(7)
    expect(v.totalSeconds).toBe(12_345)
  })

  it('forwards zero taskCount and totalSeconds', () => {
    const v = toView(baseRow({ taskCount: 0, totalSeconds: 0 }))
    expect(v.taskCount).toBe(0)
    expect(v.totalSeconds).toBe(0)
  })
})

describe('toView — purity / immutability', () => {
  it('does not mutate the input row', () => {
    const row = baseRow()
    const snapshot = JSON.stringify(row)
    toView(row)
    expect(JSON.stringify(row)).toBe(snapshot)
  })

  it('returns a new object each call (no shared reference)', () => {
    const row = baseRow()
    expect(toView(row)).not.toBe(toView(row))
  })

  it('is deterministic — same input yields deep-equal output', () => {
    const row = baseRow()
    expect(toView(row)).toEqual(toView(row))
  })
})
