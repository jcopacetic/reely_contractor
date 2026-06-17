import { describe, it, expect } from 'vitest'
import { monthKey, lastNMonths, buildStats } from './stats'

const D = (s: string) => new Date(s)

describe('monthKey', () => {
  it('formats UTC year-month, zero-padded', () => {
    expect(monthKey(D('2026-01-09T00:00:00Z'))).toBe('2026-01')
    expect(monthKey(D('2026-12-31T23:59:59Z'))).toBe('2026-12')
  })
  it('uses UTC, not local time, at a month boundary', () => {
    expect(monthKey(D('2026-03-01T00:00:00Z'))).toBe('2026-03')
  })
})

describe('lastNMonths', () => {
  it('returns n keys, oldest first, ending at now', () => {
    expect(lastNMonths(6, D('2026-06-15T12:00:00Z'))).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'])
  })
  it('rolls across a year boundary', () => {
    expect(lastNMonths(3, D('2026-01-10T00:00:00Z'))).toEqual(['2025-11', '2025-12', '2026-01'])
  })
  it('handles n = 1', () => {
    expect(lastNMonths(1, D('2026-06-01T00:00:00Z'))).toEqual(['2026-06'])
  })
})

describe('buildStats — contracts + success rate', () => {
  const now = D('2026-06-15T00:00:00Z')
  it('counts statuses and computes the other bucket', () => {
    const s = buildStats([{ status: 'active', count: 3 }, { status: 'completed', count: 4 }, { status: 'cancelled', count: 1 }, { status: 'paused', count: 2 }], [], now)
    expect(s.contracts).toEqual({ total: 10, active: 3, completed: 4, cancelled: 1, other: 2 })
  })
  it('success rate = completed / (completed + cancelled), rounded to a percent', () => {
    expect(buildStats([{ status: 'completed', count: 3 }, { status: 'cancelled', count: 1 }], [], now).successRate).toBe(75)
    expect(buildStats([{ status: 'completed', count: 1 }, { status: 'cancelled', count: 2 }], [], now).successRate).toBe(33)
  })
  it('success rate is null when nothing has ended', () => {
    expect(buildStats([{ status: 'active', count: 5 }], [], now).successRate).toBeNull()
    expect(buildStats([], [], now).successRate).toBeNull()
  })
  it('100% when every ended contract completed', () => {
    expect(buildStats([{ status: 'completed', count: 4 }], [], now).successRate).toBe(100)
  })
})

describe('buildStats — money over time', () => {
  const now = D('2026-06-15T00:00:00Z')
  it('sums total and buckets into the trailing 6 months', () => {
    const s = buildStats([], [
      { amount: 100, at: D('2026-06-02T00:00:00Z') },
      { amount: 50, at: D('2026-06-20T00:00:00Z') },
      { amount: 200, at: D('2026-04-10T00:00:00Z') },
    ], now)
    expect(s.money.total).toBe(350)
    const m = Object.fromEntries(s.money.monthly.map((x) => [x.month, x.amount]))
    expect(m['2026-06']).toBe(150)
    expect(m['2026-04']).toBe(200)
    expect(m['2026-05']).toBe(0)
    expect(s.money.monthly).toHaveLength(6)
  })
  it('rounds to cents and still totals money that falls outside the 6-month window', () => {
    const s = buildStats([], [
      { amount: 33.333, at: D('2026-06-01T00:00:00Z') }, // → 33.33
      { amount: 99.99, at: D('2025-01-01T00:00:00Z') }, // older than 6 months → in total, not in any bucket
    ], now)
    expect(s.money.total).toBe(133.32) // 33.333 + 99.99 = 133.323 → 133.32
    const m = Object.fromEntries(s.money.monthly.map((x) => [x.month, x.amount]))
    expect(m['2026-06']).toBe(33.33) // 33.333 → 33.33
    expect(s.money.monthly.some((x) => x.month === '2025-01')).toBe(false)
  })
  it('returns six zeroed months when there is no money', () => {
    const s = buildStats([], [], now)
    expect(s.money.total).toBe(0)
    expect(s.money.monthly.every((x) => x.amount === 0)).toBe(true)
  })
})
