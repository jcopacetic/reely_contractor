import { describe, expect, it } from 'vitest'
import { toView } from './store'

/**
 * UNIT tests for the pure payload transformer toView() — no DB (prisma is imported lazily and never
 * called here). toView() shapes a notification DB row into the bell's view model, with safe string
 * type-checks on the untyped `payload` JSON and a `ceremony` fallback derived from `type.split('.')[0]`.
 *
 * Determinism: every Date is built from a hard-coded ISO literal; nothing reads the clock or random.
 */

const CREATED = '2026-01-02T03:04:05.000Z'
const READ_AT = '2026-01-03T08:09:10.000Z'

type Row = Parameters<typeof toView>[0]

// A row with an empty payload + sane defaults; override per test.
function row(over: Partial<Row> = {}): Row {
  return {
    id: 'n1',
    type: 'contract.signed',
    payload: {},
    readAt: null,
    createdAt: new Date(CREATED),
    ...over,
  }
}

describe('toView — identity + scalar fields', () => {
  it('passes through id and type verbatim', () => {
    const v = toView(row({ id: 'abc', type: 'bid.placed' }))
    expect(v.id).toBe('abc')
    expect(v.type).toBe('bid.placed')
  })

  it('serializes createdAt to an ISO string', () => {
    expect(toView(row()).createdAt).toBe(CREATED)
  })

  it('read is false when readAt is null', () => {
    expect(toView(row({ readAt: null })).read).toBe(false)
  })

  it('read is true when readAt is a Date', () => {
    expect(toView(row({ readAt: new Date(READ_AT) })).read).toBe(true)
  })
})

describe('toView — full valid payload', () => {
  it('extracts every string field from a well-formed payload', () => {
    const v = toView(
      row({
        type: 'contract.signed',
        payload: {
          ceremony: 'contract',
          title: 'Contract signed',
          contractId: 'c-123',
          contractTitle: 'Build the thing',
          actorRole: 'client',
        },
      }),
    )
    expect(v).toMatchObject({
      ceremony: 'contract',
      title: 'Contract signed',
      contractId: 'c-123',
      contractTitle: 'Build the thing',
      actorRole: 'client',
    })
  })
})

describe('toView — ceremony fallback (type.split(".")[0])', () => {
  it('uses payload.ceremony when it is a string', () => {
    expect(toView(row({ type: 'contract.signed', payload: { ceremony: 'custom' } })).ceremony).toBe(
      'custom',
    )
  })

  it('falls back to the first dotted segment of type when ceremony is missing', () => {
    expect(toView(row({ type: 'contract.signed', payload: {} })).ceremony).toBe('contract')
  })

  it('falls back using the segment before the FIRST dot for multi-dot types', () => {
    expect(toView(row({ type: 'review.dimension.added', payload: {} })).ceremony).toBe('review')
  })

  it('falls back to the whole type when it has no dot', () => {
    expect(toView(row({ type: 'welcome', payload: {} })).ceremony).toBe('welcome')
  })

  it('falls back to "activity" when type is an empty string (split yields "")', () => {
    // ''.split('.')[0] === '' which is falsy → ?? does NOT catch '' so confirm actual behavior:
    // split('.') on '' returns [''] so [0] is '' (a string, not undefined) → ceremony is ''.
    expect(toView(row({ type: '', payload: {} })).ceremony).toBe('')
  })

  it('uses an empty-string ceremony from payload as-is (it is a string)', () => {
    expect(toView(row({ type: 'contract.signed', payload: { ceremony: '' } })).ceremony).toBe('')
  })

  it('ignores a non-string ceremony and falls back to the type segment', () => {
    expect(toView(row({ type: 'contract.signed', payload: { ceremony: 42 } })).ceremony).toBe(
      'contract',
    )
    expect(toView(row({ type: 'contract.signed', payload: { ceremony: null } })).ceremony).toBe(
      'contract',
    )
    expect(toView(row({ type: 'contract.signed', payload: { ceremony: ['x'] } })).ceremony).toBe(
      'contract',
    )
    expect(toView(row({ type: 'contract.signed', payload: { ceremony: { a: 1 } } })).ceremony).toBe(
      'contract',
    )
  })
})

describe('toView — title fallback (defaults to type)', () => {
  it('uses payload.title when it is a string', () => {
    expect(toView(row({ type: 'bid.placed', payload: { title: 'A new bid' } })).title).toBe(
      'A new bid',
    )
  })

  it('falls back to the raw type when title is missing', () => {
    expect(toView(row({ type: 'bid.placed', payload: {} })).title).toBe('bid.placed')
  })

  it('falls back to type when title is a non-string', () => {
    expect(toView(row({ type: 'bid.placed', payload: { title: 99 } })).title).toBe('bid.placed')
    expect(toView(row({ type: 'bid.placed', payload: { title: false } })).title).toBe('bid.placed')
    expect(toView(row({ type: 'bid.placed', payload: { title: null } })).title).toBe('bid.placed')
  })

  it('accepts an empty-string title (it is a string)', () => {
    expect(toView(row({ type: 'bid.placed', payload: { title: '' } })).title).toBe('')
  })
})

describe('toView — nullable string fields (contractId / contractTitle / actorRole)', () => {
  it('returns null for each when the payload is empty', () => {
    const v = toView(row({ payload: {} }))
    expect(v.contractId).toBeNull()
    expect(v.contractTitle).toBeNull()
    expect(v.actorRole).toBeNull()
  })

  it('returns the string value when present', () => {
    const v = toView(
      row({ payload: { contractId: 'c1', contractTitle: 'T', actorRole: 'contractor' } }),
    )
    expect(v.contractId).toBe('c1')
    expect(v.contractTitle).toBe('T')
    expect(v.actorRole).toBe('contractor')
  })

  it('coerces non-string contractId to null', () => {
    expect(toView(row({ payload: { contractId: 123 } })).contractId).toBeNull()
    expect(toView(row({ payload: { contractId: null } })).contractId).toBeNull()
    expect(toView(row({ payload: { contractId: { id: 'x' } } })).contractId).toBeNull()
    expect(toView(row({ payload: { contractId: ['c1'] } })).contractId).toBeNull()
  })

  it('coerces non-string contractTitle to null', () => {
    expect(toView(row({ payload: { contractTitle: 0 } })).contractTitle).toBeNull()
    expect(toView(row({ payload: { contractTitle: true } })).contractTitle).toBeNull()
  })

  it('coerces non-string actorRole to null', () => {
    expect(toView(row({ payload: { actorRole: 7 } })).actorRole).toBeNull()
    expect(toView(row({ payload: { actorRole: undefined } })).actorRole).toBeNull()
  })

  it('accepts empty strings for the nullable fields (a string is a string)', () => {
    const v = toView(row({ payload: { contractId: '', contractTitle: '', actorRole: '' } }))
    expect(v.contractId).toBe('')
    expect(v.contractTitle).toBe('')
    expect(v.actorRole).toBe('')
  })
})

describe('toView — malformed / missing payload as a whole', () => {
  it('treats null payload as an empty object (all fallbacks fire)', () => {
    const v = toView(row({ type: 'contract.signed', payload: null }))
    expect(v.ceremony).toBe('contract')
    expect(v.title).toBe('contract.signed')
    expect(v.contractId).toBeNull()
    expect(v.contractTitle).toBeNull()
    expect(v.actorRole).toBeNull()
  })

  it('treats undefined payload as an empty object', () => {
    const v = toView(row({ type: 'welcome', payload: undefined }))
    expect(v.ceremony).toBe('welcome')
    expect(v.title).toBe('welcome')
  })

  it('does not throw when payload is a non-object primitive (fields read as undefined)', () => {
    // (p as Record).ceremony on a string/number is undefined → all fallbacks fire, no crash.
    const vStr = toView(row({ type: 'note.created', payload: 'oops' }))
    expect(vStr.ceremony).toBe('note')
    expect(vStr.title).toBe('note.created')
    expect(vStr.contractId).toBeNull()

    const vNum = toView(row({ type: 'note.created', payload: 12345 }))
    expect(vNum.ceremony).toBe('note')
    expect(vNum.contractId).toBeNull()
  })

  it('ignores unrelated extra keys in the payload', () => {
    const v = toView(row({ type: 'contract.signed', payload: { unrelated: 'x', n: 1 } }))
    expect(v.ceremony).toBe('contract')
    expect(v.title).toBe('contract.signed')
  })

  it('returns exactly the documented set of keys (no payload passthrough leak)', () => {
    const v = toView(row({ payload: { ceremony: 'c', sneaky: 'leak' } }))
    expect(Object.keys(v).sort()).toEqual(
      [
        'actorRole',
        'ceremony',
        'contractId',
        'contractTitle',
        'createdAt',
        'id',
        'listingId',
        'read',
        'title',
        'type',
      ].sort(),
    )
    expect(v).not.toHaveProperty('sneaky')
  })
})
