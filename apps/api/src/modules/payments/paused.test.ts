import { describe, it, expect } from 'vitest'
import { overlapMs, billableSeconds } from './paused'

const ms = (h: number) => h * 3_600_000
const at = (h: number) => new Date(ms(h)) // hours past epoch

describe('overlapMs', () => {
  const win = { start: ms(0), end: ms(10) }

  it('no intervals → zero', () => {
    expect(overlapMs(win, [])).toBe(0)
  })

  it('a fully-contained interval → its own length', () => {
    expect(overlapMs(win, [{ start: ms(2), end: ms(5) }])).toBe(ms(3))
  })

  it('clamps an interval that overruns the window on both sides', () => {
    expect(overlapMs(win, [{ start: ms(-4), end: ms(20) }])).toBe(ms(10))
  })

  it('ignores an interval entirely outside the window', () => {
    expect(overlapMs(win, [{ start: ms(20), end: ms(25) }])).toBe(0)
  })

  it('merges overlapping intervals — no double count', () => {
    expect(overlapMs(win, [{ start: ms(1), end: ms(4) }, { start: ms(3), end: ms(6) }])).toBe(ms(5))
  })

  it('sums disjoint intervals', () => {
    expect(overlapMs(win, [{ start: ms(1), end: ms(2) }, { start: ms(5), end: ms(7) }])).toBe(ms(3))
  })

  it('handles unsorted input', () => {
    expect(overlapMs(win, [{ start: ms(5), end: ms(7) }, { start: ms(1), end: ms(2) }])).toBe(ms(3))
  })

  it('a zero-width or inverted interval contributes nothing', () => {
    expect(overlapMs(win, [{ start: ms(3), end: ms(3) }, { start: ms(6), end: ms(5) }])).toBe(0)
  })
})

describe('billableSeconds', () => {
  it('no paused windows → full duration', () => {
    expect(billableSeconds({ startedAt: at(1), durationSeconds: 3600 }, [])).toBe(3600)
  })

  it('zero/negative duration → zero', () => {
    expect(billableSeconds({ startedAt: at(1), durationSeconds: 0 }, [])).toBe(0)
    expect(billableSeconds({ startedAt: at(1), durationSeconds: -10 }, [{ start: at(0), end: at(2) }])).toBe(0)
  })

  it('a blocker open through the whole entry → nothing billable', () => {
    expect(billableSeconds({ startedAt: at(1), durationSeconds: 3600 }, [{ start: at(0), end: at(3) }])).toBe(0)
  })

  it('subtracts only the overlapping portion', () => {
    // entry [1h, 2h]; blocker [1.5h, 2.5h] → 30min overlap → 1800s billable
    expect(billableSeconds({ startedAt: at(1), durationSeconds: 3600 }, [{ start: at(1.5), end: at(2.5) }])).toBe(1800)
  })

  it('a blocker outside the entry window → full duration', () => {
    expect(billableSeconds({ startedAt: at(1), durationSeconds: 3600 }, [{ start: at(5), end: at(6) }])).toBe(3600)
  })

  it('uses the billed window (startedAt + duration), not a stored end', () => {
    // duration is only 30min though the blocker runs 1h — overlap clamps to the 30min billed window
    expect(billableSeconds({ startedAt: at(1), durationSeconds: 1800 }, [{ start: at(1), end: at(2) }])).toBe(0)
  })
})
