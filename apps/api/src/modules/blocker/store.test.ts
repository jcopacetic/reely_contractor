import { describe, it, expect } from 'vitest'
import { toView } from './store'

// Pure view-mapper unit tests (NO DB). toView maps a DB blocker row to the wire BlockerView and stamps the
// participatory `fromMe` flag (raisedByUserId === viewer). Dates are mapped to ISO strings. Every Date below
// is a FIXED ISO literal so the assertions are deterministic and clock-independent.

const CREATED = new Date('2026-01-02T03:04:05.000Z')
const RESOLVED = new Date('2026-02-10T11:22:33.000Z')

// A canonical, fully-populated open row raised by user 'u-raiser'.
function row(overrides: Partial<Parameters<typeof toView>[0]> = {}): Parameters<typeof toView>[0] {
  return {
    id: 'blk-1',
    status: 'open',
    reason: 'waiting on client assets',
    raisedByRole: 'contractor',
    raisedByUserId: 'u-raiser',
    resolutionNote: null,
    resolvedByRole: null,
    createdAt: CREATED,
    resolvedAt: null,
    ...overrides,
  }
}

describe('toView — field passthrough', () => {
  it('copies scalar fields verbatim', () => {
    const v = toView(row(), 'u-raiser')
    expect(v.id).toBe('blk-1')
    expect(v.status).toBe('open')
    expect(v.reason).toBe('waiting on client assets')
    expect(v.raisedByRole).toBe('contractor')
  })

  it('maps an open, unresolved row: null note, null resolvedByRole, null resolvedAt', () => {
    const v = toView(row(), 'someone')
    expect(v.resolutionNote).toBeNull()
    expect(v.resolvedByRole).toBeNull()
    expect(v.resolvedAt).toBeNull()
  })

  it('maps a resolved row: note + resolvedByRole + resolvedAt ISO', () => {
    const v = toView(
      row({ status: 'resolved', resolutionNote: 'client delivered', resolvedByRole: 'client', resolvedAt: RESOLVED }),
      'someone',
    )
    expect(v.status).toBe('resolved')
    expect(v.resolutionNote).toBe('client delivered')
    expect(v.resolvedByRole).toBe('client')
    expect(v.resolvedAt).toBe('2026-02-10T11:22:33.000Z')
  })

  it('returns exactly the BlockerView keys (no DB-only leak like raisedByUserId)', () => {
    const v = toView(row(), 'u-raiser')
    expect(Object.keys(v).sort()).toEqual(
      [
        'id',
        'status',
        'reason',
        'raisedByRole',
        'resolutionNote',
        'resolvedByRole',
        'createdAt',
        'resolvedAt',
        'fromMe',
      ].sort(),
    )
    expect('raisedByUserId' in v).toBe(false)
  })
})

describe('toView — createdAt ISO mapping', () => {
  it('serializes createdAt Date to an ISO string', () => {
    const v = toView(row(), 'x')
    expect(v.createdAt).toBe('2026-01-02T03:04:05.000Z')
    expect(typeof v.createdAt).toBe('string')
  })

  it('uses the row Date, not the current clock (epoch boundary)', () => {
    const v = toView(row({ createdAt: new Date('1970-01-01T00:00:00.000Z') }), 'x')
    expect(v.createdAt).toBe('1970-01-01T00:00:00.000Z')
  })
})

describe('toView — resolvedAt nullable mapping', () => {
  it('null resolvedAt stays null', () => {
    expect(toView(row({ resolvedAt: null }), 'x').resolvedAt).toBeNull()
  })

  it('present resolvedAt becomes ISO string', () => {
    const v = toView(row({ resolvedAt: new Date('2026-12-31T23:59:59.999Z') }), 'x')
    expect(v.resolvedAt).toBe('2026-12-31T23:59:59.999Z')
  })
})

describe('toView — resolvedByRole nullish coalescing', () => {
  it('null resolvedByRole stays null', () => {
    expect(toView(row({ resolvedByRole: null }), 'x').resolvedByRole).toBeNull()
  })

  it('contractor resolvedByRole passes through', () => {
    expect(toView(row({ resolvedByRole: 'contractor' }), 'x').resolvedByRole).toBe('contractor')
  })

  it('client resolvedByRole passes through', () => {
    expect(toView(row({ resolvedByRole: 'client' }), 'x').resolvedByRole).toBe('client')
  })
})

describe('toView — fromMe participatory flag', () => {
  it('true when viewer raised the blocker', () => {
    expect(toView(row({ raisedByUserId: 'u-raiser' }), 'u-raiser').fromMe).toBe(true)
  })

  it('false when a different user raised it', () => {
    expect(toView(row({ raisedByUserId: 'u-raiser' }), 'u-other').fromMe).toBe(false)
  })

  it('false for an empty-string viewer against a real raiser (provider-list pattern)', () => {
    expect(toView(row({ raisedByUserId: 'u-raiser' }), '').fromMe).toBe(false)
  })

  it('true only when both are empty strings (exact equality, not truthiness)', () => {
    expect(toView(row({ raisedByUserId: '' }), '').fromMe).toBe(true)
  })

  it('is exact equality — does not match on substring/prefix', () => {
    expect(toView(row({ raisedByUserId: 'u-raiser-2' }), 'u-raiser').fromMe).toBe(false)
  })

  it('is case-sensitive', () => {
    expect(toView(row({ raisedByUserId: 'U-RAISER' }), 'u-raiser').fromMe).toBe(false)
  })

  it('does not depend on raisedByRole — contractor-raised, viewer matches', () => {
    const v = toView(row({ raisedByRole: 'contractor', raisedByUserId: 'me' }), 'me')
    expect(v.fromMe).toBe(true)
    expect(v.raisedByRole).toBe('contractor')
  })
})
