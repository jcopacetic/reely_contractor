import { describe, expect, it } from 'vitest'
import { isInviteExpired } from './store'

/**
 * UNIT tests for the pure invite-expiry comparison extracted from redeemInvite() — no DB (prisma is
 * imported lazily and never called here). isInviteExpired(createdAtMs, nowMs, expiryDays) recomputes
 * `(now - createdAt) / 86_400_000 > expiryDays`, the guard that flips an invite to 'expired'.
 *
 * Determinism: every instant is built from a hard-coded ISO literal → getTime(); nothing reads the
 * clock. We probe the EXACT 30-day boundary plus a hair inside / outside it.
 */

const MS_PER_DAY = 86_400_000
const DEFAULT_DAYS = 30

// Fixed anchor (literal ISO). All `now` values are derived from this by adding whole/partial days.
const CREATED_ISO = '2026-01-01T00:00:00.000Z'
const createdMs = new Date(CREATED_ISO).getTime()
const nowAfter = (days: number) => createdMs + days * MS_PER_DAY

describe('isInviteExpired — boundary around the 30-day window', () => {
  it('is NOT expired well within the window (1 day old)', () => {
    expect(isInviteExpired(createdMs, nowAfter(1))).toBe(false)
  })

  it('is NOT expired at exactly the window edge (strict >, so 30d is still valid)', () => {
    // ageDays === 30 → 30 > 30 is false
    expect(isInviteExpired(createdMs, nowAfter(30))).toBe(false)
  })

  it('is NOT expired a hair INSIDE the edge (one ms before 30 days)', () => {
    expect(isInviteExpired(createdMs, nowAfter(30) - 1)).toBe(false)
  })

  it('IS expired a hair OUTSIDE the edge (one ms after 30 days)', () => {
    // ageDays just over 30 → > 30 is true
    expect(isInviteExpired(createdMs, nowAfter(30) + 1)).toBe(true)
  })

  it('IS expired well past the window (45 days old)', () => {
    expect(isInviteExpired(createdMs, nowAfter(45))).toBe(true)
  })

  it('IS expired exactly one full day past the edge (31 days)', () => {
    expect(isInviteExpired(createdMs, nowAfter(31))).toBe(true)
  })
})

describe('isInviteExpired — degenerate / non-forward time', () => {
  it('is NOT expired for a brand-new invite (now === createdAt, age 0)', () => {
    expect(isInviteExpired(createdMs, createdMs)).toBe(false)
  })

  it('is NOT expired when now is BEFORE createdAt (negative age)', () => {
    expect(isInviteExpired(createdMs, nowAfter(-5))).toBe(false)
  })
})

describe('isInviteExpired — custom expiry windows', () => {
  it('honors a shorter window (7 days)', () => {
    expect(isInviteExpired(createdMs, nowAfter(7), 7)).toBe(false) // edge inclusive
    expect(isInviteExpired(createdMs, nowAfter(7) + 1, 7)).toBe(true)
    expect(isInviteExpired(createdMs, nowAfter(8), 7)).toBe(true)
  })

  it('honors a longer window (90 days)', () => {
    expect(isInviteExpired(createdMs, nowAfter(60), 90)).toBe(false)
    expect(isInviteExpired(createdMs, nowAfter(90), 90)).toBe(false)
    expect(isInviteExpired(createdMs, nowAfter(91), 90)).toBe(true)
  })

  it('defaults to the production 30-day window when expiryDays is omitted', () => {
    expect(isInviteExpired(createdMs, nowAfter(DEFAULT_DAYS))).toBe(false)
    expect(isInviteExpired(createdMs, nowAfter(DEFAULT_DAYS + 1))).toBe(true)
  })

  it('treats a zero-day window as: any positive age is expired', () => {
    expect(isInviteExpired(createdMs, createdMs, 0)).toBe(false) // age 0, not > 0
    expect(isInviteExpired(createdMs, createdMs + 1, 0)).toBe(true)
  })
})
