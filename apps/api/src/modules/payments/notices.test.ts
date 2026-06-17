import { describe, it, expect } from 'vitest'
import {
  firstContractFor,
  remindWindowEnd,
  isWithinReminderWindow,
  REMIND_AHEAD_MS,
} from './notices'

// Fixed clock anchors — never `new Date()`. All assertions are now-relative-free.
const NOW = new Date('2026-06-15T12:00:00.000Z')
const HOUR = 3_600_000

describe('REMIND_AHEAD_MS', () => {
  it('is 30 hours in milliseconds (~24h plus daily-run slack)', () => {
    expect(REMIND_AHEAD_MS).toBe(30 * 3_600_000)
    expect(REMIND_AHEAD_MS).toBe(108_000_000)
  })

  it('is strictly greater than 24h so a daily run never misses a cycle', () => {
    expect(REMIND_AHEAD_MS).toBeGreaterThan(24 * HOUR)
  })
})

describe('remindWindowEnd', () => {
  it('adds exactly REMIND_AHEAD_MS to now', () => {
    const end = remindWindowEnd(NOW)
    expect(end.getTime()).toBe(NOW.getTime() + REMIND_AHEAD_MS)
    expect(end.toISOString()).toBe('2026-06-16T18:00:00.000Z')
  })

  it('does not mutate the input Date', () => {
    const before = NOW.getTime()
    remindWindowEnd(NOW)
    expect(NOW.getTime()).toBe(before)
  })

  it('returns a fresh Date instance each call', () => {
    expect(remindWindowEnd(NOW)).not.toBe(remindWindowEnd(NOW))
    expect(remindWindowEnd(NOW).getTime()).toBe(remindWindowEnd(NOW).getTime())
  })

  it('handles the unix epoch boundary (zero ms)', () => {
    const epoch = new Date(0)
    expect(remindWindowEnd(epoch).getTime()).toBe(REMIND_AHEAD_MS)
  })

  it('handles a pre-epoch (negative ms) instant', () => {
    const past = new Date(-HOUR) // one hour before epoch
    expect(remindWindowEnd(past).getTime()).toBe(-HOUR + REMIND_AHEAD_MS)
  })
})

describe('isWithinReminderWindow', () => {
  it('is true for a close one hour from now (well inside)', () => {
    expect(isWithinReminderWindow(new Date(NOW.getTime() + HOUR), NOW)).toBe(true)
  })

  it('is true for a close ~24h out', () => {
    expect(isWithinReminderWindow(new Date(NOW.getTime() + 24 * HOUR), NOW)).toBe(true)
  })

  it('is FALSE at exactly now (gt is strict, not >=)', () => {
    expect(isWithinReminderWindow(new Date(NOW.getTime()), NOW)).toBe(false)
  })

  it('is true one millisecond after now (lower boundary, exclusive open)', () => {
    expect(isWithinReminderWindow(new Date(NOW.getTime() + 1), NOW)).toBe(true)
  })

  it('is TRUE at exactly the upper bound now+REMIND_AHEAD_MS (lte is inclusive)', () => {
    expect(isWithinReminderWindow(remindWindowEnd(NOW), NOW)).toBe(true)
  })

  it('is FALSE one millisecond past the upper bound', () => {
    expect(isWithinReminderWindow(new Date(NOW.getTime() + REMIND_AHEAD_MS + 1), NOW)).toBe(false)
  })

  it('is false for a close already in the past (before now)', () => {
    expect(isWithinReminderWindow(new Date(NOW.getTime() - HOUR), NOW)).toBe(false)
  })

  it('is false for a close far in the future (a week out)', () => {
    expect(isWithinReminderWindow(new Date(NOW.getTime() + 7 * 24 * HOUR), NOW)).toBe(false)
  })

  it('matches remindWindowEnd as its inclusive upper edge', () => {
    const end = remindWindowEnd(NOW)
    expect(isWithinReminderWindow(end, NOW)).toBe(true)
    expect(isWithinReminderWindow(new Date(end.getTime() + 1), NOW)).toBe(false)
  })

  it('does not mutate its Date inputs', () => {
    const ends = new Date(NOW.getTime() + HOUR)
    const endsBefore = ends.getTime()
    const nowBefore = NOW.getTime()
    isWithinReminderWindow(ends, NOW)
    expect(ends.getTime()).toBe(endsBefore)
    expect(NOW.getTime()).toBe(nowBefore)
  })
})

type C = { id: string; clientUserId: string; contractorUserId: string }
const mk = (id: string, clientUserId: string, contractorUserId: string): C => ({ id, clientUserId, contractorUserId })

describe('firstContractFor', () => {
  it('returns an empty map for no contracts', () => {
    const m = firstContractFor<C>([], (c) => c.clientUserId)
    expect(m.size).toBe(0)
  })

  it('maps a single contract by the picked key', () => {
    const m = firstContractFor([mk('k1', 'client-a', 'pro-a')], (c) => c.clientUserId)
    expect(m.size).toBe(1)
    expect(m.get('client-a')).toBe('k1')
  })

  it('keeps the FIRST contract id when a key repeats (dedup, one nudge per user)', () => {
    const contracts = [
      mk('k1', 'client-a', 'pro-x'),
      mk('k2', 'client-a', 'pro-y'), // same client — should be ignored
      mk('k3', 'client-a', 'pro-z'), // same client — should be ignored
    ]
    const m = firstContractFor(contracts, (c) => c.clientUserId)
    expect(m.size).toBe(1)
    expect(m.get('client-a')).toBe('k1')
  })

  it('produces one entry per distinct key', () => {
    const contracts = [
      mk('k1', 'client-a', 'pro-x'),
      mk('k2', 'client-b', 'pro-x'),
      mk('k3', 'client-c', 'pro-y'),
    ]
    const m = firstContractFor(contracts, (c) => c.clientUserId)
    expect(m.size).toBe(3)
    expect(m.get('client-a')).toBe('k1')
    expect(m.get('client-b')).toBe('k2')
    expect(m.get('client-c')).toBe('k3')
  })

  it('dedups independently by contractor vs client key (the two real call sites)', () => {
    const contracts = [
      mk('k1', 'client-a', 'pro-x'),
      mk('k2', 'client-b', 'pro-x'), // same contractor pro-x, different client
    ]
    const byContractor = firstContractFor(contracts, (c) => c.contractorUserId)
    const byClient = firstContractFor(contracts, (c) => c.clientUserId)
    expect(byContractor.size).toBe(1)
    expect(byContractor.get('pro-x')).toBe('k1')
    expect(byClient.size).toBe(2)
  })

  it('preserves first-occurrence insertion order', () => {
    const contracts = [
      mk('k1', 'client-c', 'pro-1'),
      mk('k2', 'client-a', 'pro-2'),
      mk('k3', 'client-b', 'pro-3'),
      mk('k4', 'client-a', 'pro-4'), // dup of client-a, ignored
    ]
    const m = firstContractFor(contracts, (c) => c.clientUserId)
    expect([...m.keys()]).toEqual(['client-c', 'client-a', 'client-b'])
    expect([...m.values()]).toEqual(['k1', 'k2', 'k3'])
  })

  it('treats distinct keys that share no overlap as fully separate', () => {
    const contracts = [mk('k1', '', 'pro-x'), mk('k2', 'client-b', 'pro-x')]
    const byClient = firstContractFor(contracts, (c) => c.clientUserId)
    // empty-string is still a valid distinct key
    expect(byClient.size).toBe(2)
    expect(byClient.get('')).toBe('k1')
    expect(byClient.get('client-b')).toBe('k2')
  })

  it('does not mutate the input array', () => {
    const contracts = [mk('k1', 'client-a', 'pro-x'), mk('k2', 'client-a', 'pro-y')]
    const snapshot = contracts.map((c) => ({ ...c }))
    firstContractFor(contracts, (c) => c.clientUserId)
    expect(contracts).toEqual(snapshot)
  })

  it('works with an arbitrary pick function (id itself → identity map)', () => {
    const contracts = [mk('k1', 'a', 'x'), mk('k2', 'b', 'y')]
    const m = firstContractFor(contracts, (c) => c.id)
    expect(m.get('k1')).toBe('k1')
    expect(m.get('k2')).toBe('k2')
  })
})
