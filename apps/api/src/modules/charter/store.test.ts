import { describe, expect, it } from 'vitest'
import { clip, toView } from './store'

/**
 * Pure-logic unit tests for the charter store. NO database is touched here: `clip` and `toView` are pure
 * functions over their arguments. All Dates are built from fixed ISO string literals for determinism — never
 * the wall clock. (The query functions get/save/acknowledge/closeOut/provider* hit prisma and are e2e-covered.)
 */

// A complete charter row shape (matches the internal CharterRow non-null branch). Helper keeps tests dense.
type Row = NonNullable<Parameters<typeof toView>[0]>
const row = (over: Partial<Row> = {}): Row => ({
  goals: null,
  workingAgreement: null,
  successCriteria: null,
  clientAcknowledged: false,
  contractorAcknowledged: false,
  lastEditedByRole: null,
  kickedOffAt: null,
  closeOutNote: null,
  closedAt: null,
  ...over,
})

describe('clip — trim + cap charter text at 4000 chars', () => {
  it('returns null for null', () => expect(clip(null)).toBeNull())
  it('returns null for undefined', () => expect(clip(undefined)).toBeNull())
  it('returns null for empty string', () => expect(clip('')).toBeNull())
  it('returns null for whitespace-only string (trims to empty)', () => {
    expect(clip('   ')).toBeNull()
    expect(clip('\t\n  \r')).toBeNull()
  })

  it('trims leading and trailing whitespace', () => {
    expect(clip('  hello  ')).toBe('hello')
    expect(clip('\n\tworking agreement\t\n')).toBe('working agreement')
  })

  it('preserves interior whitespace and content', () => {
    expect(clip('a  b\nc')).toBe('a  b\nc')
  })

  it('returns the string unchanged when within the cap', () => {
    const s = 'reasonable goals text'
    expect(clip(s)).toBe(s)
  })

  it('keeps exactly 4000 chars untouched (boundary)', () => {
    const s = 'x'.repeat(4000)
    const out = clip(s)
    expect(out).not.toBeNull()
    expect(out!.length).toBe(4000)
    expect(out).toBe(s)
  })

  it('caps 4001 chars to 4000 (over-boundary by one)', () => {
    const out = clip('y'.repeat(4001))
    expect(out!.length).toBe(4000)
    expect(out).toBe('y'.repeat(4000))
  })

  it('caps far-over input to 4000', () => {
    const out = clip('z'.repeat(10_000))
    expect(out!.length).toBe(4000)
  })

  it('trims BEFORE the cap is applied (leading whitespace does not consume budget)', () => {
    // 10 leading spaces + 4000 'a' → trim removes spaces, leaving 4000 'a' which survives the cap whole.
    const out = clip('          ' + 'a'.repeat(4000))
    expect(out!.length).toBe(4000)
    expect(out).toBe('a'.repeat(4000))
  })

  it('does not re-trim after slicing (a slice landing on whitespace keeps it)', () => {
    // 3999 'a' then a space then more 'a' → slice(0,4000) = 3999 'a' + 1 space; output retains the trailing space.
    const out = clip('a'.repeat(3999) + ' ' + 'b'.repeat(50))
    expect(out!.length).toBe(4000)
    expect(out!.endsWith(' ')).toBe(true)
  })

  it('coerces non-string primitives via String() then keeps them', () => {
    expect(clip(42)).toBe('42')
    expect(clip(0)).toBe('0')
    expect(clip(false)).toBe('false')
    expect(clip(true)).toBe('true')
  })

  it('coerces 0 (a truthy-looking falsy number) to the string "0", not null', () => {
    expect(clip(0)).toBe('0')
  })
})

describe('toView — status derivation from dates + field mapping', () => {
  it('derives draft when neither kickedOffAt nor closedAt is set', () => {
    expect(toView(row(), 'client').status).toBe('draft')
  })

  it('derives active when kickedOffAt is set but closedAt is not', () => {
    expect(toView(row({ kickedOffAt: new Date('2026-01-02T03:04:05.000Z') }), 'client').status).toBe('active')
  })

  it('derives closed when closedAt is set (regardless of kickedOffAt)', () => {
    expect(toView(row({ closedAt: new Date('2026-02-01T00:00:00.000Z') }), 'client').status).toBe('closed')
    const both = toView(
      row({ kickedOffAt: new Date('2026-01-01T00:00:00.000Z'), closedAt: new Date('2026-02-01T00:00:00.000Z') }),
      'contractor',
    )
    expect(both.status).toBe('closed')
  })

  it('closedAt takes precedence over kickedOffAt for status', () => {
    const v = toView(
      row({ kickedOffAt: new Date('2026-03-03T00:00:00.000Z'), closedAt: new Date('2026-03-04T00:00:00.000Z') }),
      'client',
    )
    expect(v.status).toBe('closed')
  })

  it('serializes kickedOffAt + closedAt Dates to ISO strings', () => {
    const v = toView(
      row({ kickedOffAt: new Date('2026-01-02T03:04:05.678Z'), closedAt: new Date('2026-05-06T07:08:09.000Z') }),
      'client',
    )
    expect(v.kickedOffAt).toBe('2026-01-02T03:04:05.678Z')
    expect(v.closedAt).toBe('2026-05-06T07:08:09.000Z')
  })

  it('leaves kickedOffAt/closedAt null when their Dates are null', () => {
    const v = toView(row(), 'contractor')
    expect(v.kickedOffAt).toBeNull()
    expect(v.closedAt).toBeNull()
  })

  it('passes through the text + ack + note fields verbatim', () => {
    const v = toView(
      row({
        goals: 'ship v1',
        workingAgreement: 'async, 2 standups/wk',
        successCriteria: 'beta live',
        clientAcknowledged: true,
        contractorAcknowledged: true,
        closeOutNote: 'great run',
        lastEditedByRole: 'contractor',
      }),
      'client',
    )
    expect(v.goals).toBe('ship v1')
    expect(v.workingAgreement).toBe('async, 2 standups/wk')
    expect(v.successCriteria).toBe('beta live')
    expect(v.clientAcknowledged).toBe(true)
    expect(v.contractorAcknowledged).toBe(true)
    expect(v.closeOutNote).toBe('great run')
    expect(v.lastEditedByRole).toBe('contractor')
  })

  it('echoes myRole into the view unchanged', () => {
    expect(toView(row(), 'client').myRole).toBe('client')
    expect(toView(row(), 'contractor').myRole).toBe('contractor')
  })

  it('coerces an arbitrary lastEditedByRole string straight through (cast, no validation)', () => {
    const v = toView(row({ lastEditedByRole: 'client' }), 'contractor')
    expect(v.lastEditedByRole).toBe('client')
  })

  describe('null charter (no row yet) → empty draft view', () => {
    it('yields status draft', () => {
      expect(toView(null, 'client').status).toBe('draft')
    })

    it('nulls all text fields and defaults acks to false', () => {
      const v = toView(null, 'contractor')
      expect(v.goals).toBeNull()
      expect(v.workingAgreement).toBeNull()
      expect(v.successCriteria).toBeNull()
      expect(v.clientAcknowledged).toBe(false)
      expect(v.contractorAcknowledged).toBe(false)
      expect(v.lastEditedByRole).toBeNull()
      expect(v.kickedOffAt).toBeNull()
      expect(v.closeOutNote).toBeNull()
      expect(v.closedAt).toBeNull()
    })

    it('still carries the requested myRole', () => {
      expect(toView(null, 'contractor').myRole).toBe('contractor')
    })
  })

  it('treats explicit null text fields the same as absent ones', () => {
    const v = toView(row({ goals: null, workingAgreement: null, successCriteria: null }), 'client')
    expect(v.goals).toBeNull()
    expect(v.workingAgreement).toBeNull()
    expect(v.successCriteria).toBeNull()
  })
})
