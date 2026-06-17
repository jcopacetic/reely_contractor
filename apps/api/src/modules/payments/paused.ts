/**
 * paused-interval billing exclusion — while a blocker is open on a contract, the clock is paused, so time that
 * fell inside a blocker's [raised, resolved] window is NOT billed. The pure overlap math (overlapMs / billableSeconds)
 * is unit-tested; pausedIntervalsForContract reads the blockers. The weekly sweep sums billableSeconds per entry.
 */
import { prisma } from '@contractor/db'

export type Interval = { start: number; end: number } // epoch ms

/** Milliseconds of `window` covered by ANY of `intervals` — clamped to the window + merged (no double-count). */
export function overlapMs(window: Interval, intervals: Interval[]): number {
  const clamped = intervals
    .map((i) => ({ start: Math.max(i.start, window.start), end: Math.min(i.end, window.end) }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start)
  let total = 0
  let curStart = 0
  let curEnd = 0
  let open = false
  for (const c of clamped) {
    if (!open) {
      curStart = c.start
      curEnd = c.end
      open = true
    } else if (c.start <= curEnd) {
      curEnd = Math.max(curEnd, c.end)
    } else {
      total += curEnd - curStart
      curStart = c.start
      curEnd = c.end
    }
  }
  if (open) total += curEnd - curStart
  return total
}

/** A time entry's BILLABLE seconds = its duration minus any portion inside a paused (open-blocker) interval.
 *  The billed window is [startedAt, startedAt + durationSeconds]. */
export function billableSeconds(entry: { startedAt: Date; durationSeconds: number }, paused: Array<{ start: Date; end: Date }>): number {
  if (entry.durationSeconds <= 0) return 0
  if (paused.length === 0) return entry.durationSeconds
  const start = entry.startedAt.getTime()
  const end = start + entry.durationSeconds * 1000
  const ovl = overlapMs({ start, end }, paused.map((p) => ({ start: p.start.getTime(), end: p.end.getTime() })))
  return Math.max(0, entry.durationSeconds - Math.floor(ovl / 1000))
}

/** The contract's paused windows: each blocker's [raised, resolved]; an OPEN blocker is paused up to `asOf`. */
export async function pausedIntervalsForContract(contractId: string, asOf: Date): Promise<Array<{ start: Date; end: Date }>> {
  const blockers = await prisma.blocker.findMany({ where: { contractId }, select: { createdAt: true, resolvedAt: true } })
  return blockers.map((b) => ({ start: b.createdAt, end: b.resolvedAt ?? asOf }))
}
