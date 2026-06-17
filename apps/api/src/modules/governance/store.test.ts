import { describe, it, expect } from 'vitest'
import { disabledReasonFor, labelFor, CLIENT_REASONS, CONTRACTOR_REASONS } from './store'

// Pure-logic unit tests (NO DB). These cover the two clock/DB-independent pieces of governance/store:
//   1. disabledReasonFor — only the STATUS-DERIVED branches that short-circuit BEFORE any prisma read.
//      A 'paused' status returns 'contract_paused'; any non-'active' status returns 'contract_not_active'.
//      We NEVER call it with status === 'active' here — that branch fans out to prisma (DB-only / e2e).
//   2. labelFor — maps a suspension reason code to a human-readable label, with an 'account review' fallback.
//
// parties() builds the minimal { clientUserId, contractorUserId, status } shape disabledReasonFor accepts.
// The user ids are present but never read on the pure branches (the function returns before touching them).

function parties(status: string): Parameters<typeof disabledReasonFor>[0] {
  return { clientUserId: 'client-1', contractorUserId: 'contractor-1', status }
}

describe('disabledReasonFor — paused branch (pure, pre-DB)', () => {
  it("returns 'contract_paused' for status 'paused'", async () => {
    expect(await disabledReasonFor(parties('paused'))).toBe('contract_paused')
  })

  it('paused takes precedence — it is checked before the not-active branch', async () => {
    // 'paused' is itself not 'active', but the paused check comes first, so the label is the paused one.
    expect(await disabledReasonFor(parties('paused'))).not.toBe('contract_not_active')
  })

  it('is exact-match — does not match the prefix substring "pause"', async () => {
    // 'pause' is neither 'paused' nor 'active' → falls through to the not-active branch.
    expect(await disabledReasonFor(parties('pause'))).toBe('contract_not_active')
  })

  it('is case-sensitive — "Paused" is not the paused branch', async () => {
    expect(await disabledReasonFor(parties('Paused'))).toBe('contract_not_active')
  })
})

describe('disabledReasonFor — not-active branch (pure, pre-DB)', () => {
  it("returns 'contract_not_active' for status 'draft'", async () => {
    expect(await disabledReasonFor(parties('draft'))).toBe('contract_not_active')
  })

  it("returns 'contract_not_active' for status 'completed'", async () => {
    expect(await disabledReasonFor(parties('completed'))).toBe('contract_not_active')
  })

  it("returns 'contract_not_active' for status 'cancelled'", async () => {
    expect(await disabledReasonFor(parties('cancelled'))).toBe('contract_not_active')
  })

  it("returns 'contract_not_active' for an empty status string", async () => {
    expect(await disabledReasonFor(parties(''))).toBe('contract_not_active')
  })

  it("returns 'contract_not_active' for an arbitrary unknown status", async () => {
    expect(await disabledReasonFor(parties('zzz-unknown'))).toBe('contract_not_active')
  })

  it("is case-sensitive — 'ACTIVE' is treated as not-active (does not reach the DB branch)", async () => {
    // 'ACTIVE' !== 'active', so it short-circuits to not-active without any prisma read.
    expect(await disabledReasonFor(parties('ACTIVE'))).toBe('contract_not_active')
  })

  it('returns a string (never null) on the status-derived branches', async () => {
    const r = await disabledReasonFor(parties('draft'))
    expect(typeof r).toBe('string')
    expect(r).not.toBeNull()
  })
})

describe('labelFor — known reason codes', () => {
  const cases: Array<[string, string]> = [
    ['payment_declined', 'a declined payment'],
    ['non_payment', 'non-payment'],
    ['abuse', 'a terms/abuse concern'],
    ['terms_violation', 'a terms violation'],
    ['conduct', 'a conduct concern'],
    ['quality', 'a quality concern'],
    ['inactivity', 'inactivity'],
    ['request', 'a request'],
    ['other', 'an account review'],
  ]

  it.each(cases)('maps %s → %s', (code, label) => {
    expect(labelFor(code)).toBe(label)
  })

  it('maps every declared CLIENT_REASONS code to a non-empty label', () => {
    for (const r of CLIENT_REASONS) {
      const label = labelFor(r)
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
    }
  })

  it('maps every declared CONTRACTOR_REASONS code to a non-empty label', () => {
    for (const r of CONTRACTOR_REASONS) {
      const label = labelFor(r)
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
    }
  })
})

describe('labelFor — fallback for unknown / nullish input', () => {
  it("returns the 'an account review' fallback for an unknown code", () => {
    expect(labelFor('totally_made_up')).toBe('an account review')
  })

  it('returns the fallback for undefined (no argument)', () => {
    expect(labelFor()).toBe('an account review')
  })

  it('returns the fallback for explicit undefined', () => {
    expect(labelFor(undefined)).toBe('an account review')
  })

  it('returns the fallback for null', () => {
    expect(labelFor(null)).toBe('an account review')
  })

  it("returns the fallback for an empty string (falsy → 'an account review')", () => {
    // '' is falsy, so the `r ? ... : fallback` ternary takes the fallback branch.
    expect(labelFor('')).toBe('an account review')
  })

  it('is case-sensitive — uppercase code does not match the lowercase key', () => {
    expect(labelFor('ABUSE')).toBe('an account review')
  })

  it('does not trim — surrounding whitespace misses the key and falls back', () => {
    expect(labelFor(' abuse ')).toBe('an account review')
  })

  it("the literal 'other' code and the fallback both resolve to 'an account review'", () => {
    expect(labelFor('other')).toBe(labelFor('unknown-code'))
  })
})
