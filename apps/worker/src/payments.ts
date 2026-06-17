/**
 * The weekly billing tick (cron Sun 18:00 UTC, declared in scheduler.ts) + a manual admin enqueue. Two phases,
 * both idempotent, run in this order every tick:
 *   (1) charge — settle cycles whose 7-day dispute window has closed with no open dispute (stub → also pays out).
 *   (2) sweep  — fold each contract's APPROVED, un-billed time from the week that just ended into that week's
 *       cycle, opening a fresh 7-day window. A cycle opened this Sunday is therefore charged next Sunday.
 * The engine itself (sweepCycle/chargeDueCycles) is the api's single source of truth, imported here so the
 * cron and the request path can never diverge. Stripe is stubbed when unset — the DB state is authoritative.
 */
import { prisma } from '@contractor/db'
import { sweepCycle, chargeDueCycles } from '@contractor/api/payments'
import { cutRunningTimersAtBoundary } from '@contractor/api/time'

const WEEK_MS = 7 * 86_400_000

/** The week [prevSun18:00, mostRecentSun18:00] that has fully completed at `now` (UTC). Snapped to the Sunday
 *  18:00 boundary so repeated runs/manual enqueues key to the same cycle (sweepCycle is idempotent on period). */
export function lastCompletedWeek(now: Date): { periodStart: Date; periodEnd: Date } {
  const end = new Date(now.getTime())
  end.setUTCHours(18, 0, 0, 0)
  const dow = end.getUTCDay() // 0 = Sunday
  // Step back to the most recent Sunday 18:00 at or before `now`.
  if (dow === 0 && now.getTime() < end.getTime()) end.setTime(end.getTime() - WEEK_MS) // Sunday but pre-18:00
  else end.setTime(end.getTime() - dow * 86_400_000)
  return { periodStart: new Date(end.getTime() - WEEK_MS), periodEnd: end }
}

/** Run one billing tick. Returns counts for the worker log. */
export async function runBillingCycle(now = new Date()): Promise<{ charged: number; swept: number; timersCut: number }> {
  const { charged } = await chargeDueCycles(now)
  const { periodStart, periodEnd } = lastCompletedWeek(now)
  // Auto-cut running timers at the week boundary so pre-boundary time lands in the just-ended week + the timer
  // continues into the new week.
  const { cut: timersCut } = await cutRunningTimersAtBoundary(periodEnd)
  // Only contracts that actually have un-billed, approved, ended time — no empty cycles.
  const pending = await prisma.timeEntry.findMany({
    where: { approved: true, disputed: false, billingCycleId: null, endedAt: { not: null } },
    select: { contractId: true },
    distinct: ['contractId'],
  })
  let swept = 0
  for (const { contractId } of pending) {
    const r = await sweepCycle(contractId, periodStart, periodEnd)
    if (r) swept++
  }
  return { charged, swept, timersCut }
}
