/**
 * billing dashboard — the read-side roll-up of the weekly money engine for ONE party. Three week buckets
 * (this week / last week / the week before, on the same Sunday-18:00 boundary the cron uses), each a table of
 * the counterparty contracts active that week with a status + amount, expandable to the tasks (time entries)
 * settled in that week. Same shape both sides; only the labels differ (contractor sees "paid", client "charged").
 * Reads cycles + time entries; the current week is the in-progress accrual (no cycle yet).
 */
import { prisma } from '@contractor/db'

type Role = 'client' | 'contractor'
type Status = 'in_progress' | 'in_review' | 'paid'

export type BillingTask = { title: string; seconds: number; approved: boolean }
export type BillingRow = {
  contractId: string
  title: string
  status: Status
  grossAmount: number
  netAmount: number
  seconds: number
  taskCount: number
  tasks: BillingTask[]
}
export type BillingWeek = { periodStart: string; periodEnd: string; label: string; status: 'current' | 'recent'; rows: BillingRow[]; gross: number; net: number }

export type DashContract = { id: string; title: string; rateType: string; rateAmount: number }

const WEEK_MS = 7 * 86_400_000
const round2 = (n: number) => Math.round(n * 100) / 100

/** The Sunday-18:00 boundary at or before `now` — the start of the current (in-progress) week. */
function currentWeekStart(now: Date): Date {
  const d = new Date(now.getTime())
  d.setUTCHours(18, 0, 0, 0)
  const dow = d.getUTCDay() // 0 = Sun
  if (dow === 0 && now.getTime() < d.getTime()) d.setTime(d.getTime() - WEEK_MS) // Sun but pre-18:00
  else d.setTime(d.getTime() - dow * 86_400_000)
  return d
}

const amountFor = (c: DashContract, seconds: number) => round2(c.rateType === 'hourly' ? (seconds / 3600) * c.rateAmount : c.rateAmount)
const taskOf = (e: { description: string | null; durationSeconds: number; approved: boolean }): BillingTask => ({ title: e.description?.trim() || 'Tracked work', seconds: e.durationSeconds, approved: e.approved })

export async function buildBillingWeeks(contracts: DashContract[], role: Role, now = new Date()): Promise<BillingWeek[]> {
  if (contracts.length === 0) return []
  const ids = contracts.map((c) => c.id)
  const byId = new Map(contracts.map((c) => [c.id, c]))
  const curStart = currentWeekStart(now)
  const lastStart = new Date(curStart.getTime() - WEEK_MS)
  const beforeStart = new Date(curStart.getTime() - 2 * WEEK_MS)

  // Completed-week cycles (last + the week before), with their settled time entries for the task rows.
  const cycles = await prisma.billingCycle.findMany({
    where: { contractId: { in: ids }, periodStart: { in: [lastStart, beforeStart] }, status: { in: ['dispute_window', 'disputed', 'charged'] } },
    select: { contractId: true, periodStart: true, status: true, totalSeconds: true, totalAmount: true, takeRateAmount: true, entries: { select: { description: true, durationSeconds: true, approved: true } } },
  })
  // Current-week accrual (ended entries this week, not yet swept into a charged/closed cycle).
  const curEntries = await prisma.timeEntry.findMany({
    where: { contractId: { in: ids }, startedAt: { gte: curStart, lt: new Date(curStart.getTime() + WEEK_MS) }, endedAt: { not: null } },
    select: { contractId: true, description: true, durationSeconds: true, approved: true },
  })

  const mkRow = (c: DashContract, status: Status, seconds: number, gross: number, net: number, tasks: BillingTask[]): BillingRow => ({ contractId: c.id, title: c.title, status, grossAmount: gross, netAmount: net, seconds, taskCount: tasks.length, tasks })

  const weekFrom = (start: Date, kind: 'current' | 'recent'): BillingWeek => {
    const rows: BillingRow[] = []
    if (kind === 'current') {
      const byContract = new Map<string, typeof curEntries>()
      for (const e of curEntries) (byContract.get(e.contractId) ?? byContract.set(e.contractId, []).get(e.contractId)!).push(e)
      for (const [cid, es] of byContract) {
        const c = byId.get(cid); if (!c) continue
        const seconds = es.reduce((n, e) => n + e.durationSeconds, 0)
        const gross = amountFor(c, seconds)
        rows.push(mkRow(c, 'in_progress', seconds, gross, gross, es.map(taskOf)))
      }
    } else {
      for (const cy of cycles.filter((x) => x.periodStart.getTime() === start.getTime())) {
        const c = byId.get(cy.contractId); if (!c) continue
        const gross = Number(cy.totalAmount)
        const net = round2(gross - Number(cy.takeRateAmount))
        rows.push(mkRow(c, cy.status === 'charged' ? 'paid' : 'in_review', cy.totalSeconds, gross, net, cy.entries.map(taskOf)))
      }
    }
    rows.sort((a, b) => b.grossAmount - a.grossAmount)
    const label = kind === 'current' ? 'This week' : start.getTime() === lastStart.getTime() ? 'Last week' : 'The week before'
    return {
      periodStart: start.toISOString(),
      periodEnd: new Date(start.getTime() + WEEK_MS).toISOString(),
      label,
      status: kind,
      rows,
      gross: round2(rows.reduce((n, r) => n + r.grossAmount, 0)),
      net: round2(rows.reduce((n, r) => n + r.netAmount, 0)),
    }
  }

  // role is reserved for future per-side labeling; the structure is identical, the web layer names the columns.
  void role
  return [weekFrom(curStart, 'current'), weekFrom(lastStart, 'recent'), weekFrom(beforeStart, 'recent')]
}

/** The contractor's billing dashboard (their contracts). */
export async function contractorBillingDashboard(contractorUserId: string): Promise<BillingWeek[]> {
  const contracts = await prisma.contract.findMany({ where: { contractorUserId }, orderBy: { startedAt: 'desc' }, take: 100, select: { id: true, title: true, rateType: true, rateAmount: true } })
  return buildBillingWeeks(contracts.map((c) => ({ id: c.id, title: c.title, rateType: c.rateType as string, rateAmount: Number(c.rateAmount) })), 'contractor')
}

/** The client's billing dashboard for a set of Board-owned contracts (boardRef-scoped per ref). */
export async function providerBillingDashboard(contractRefs: string[]): Promise<BillingWeek[]> {
  if (contractRefs.length === 0) return []
  const contracts = await prisma.contract.findMany({ where: { id: { in: contractRefs }, boardRef: { not: null } }, take: 200, select: { id: true, title: true, rateType: true, rateAmount: true } })
  return buildBillingWeeks(contracts.map((c) => ({ id: c.id, title: c.title, rateType: c.rateType as string, rateAmount: Number(c.rateAmount) })), 'client')
}
