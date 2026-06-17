/**
 * financial stats — a per-party roll-up over the contracts + the immutable ledger. Contracts ran (by status),
 * a completion-based success rate, and money over time (last 6 months): the contractor sees NET earned, the
 * client sees GROSS spent. Pure aggregation helpers (buildStats / monthKey / lastNMonths) are exported for unit
 * tests; the query wrappers read prisma. Same shape both sides.
 */
import { prisma } from '@contractor/db'

const round2 = (n: number) => Math.round(n * 100) / 100

export type PartyStats = {
  contracts: { total: number; active: number; completed: number; cancelled: number; other: number }
  successRate: number | null // completed / (completed + cancelled), as a 0–100 %, or null if none have ended
  money: { total: number; currency: string; monthly: Array<{ month: string; amount: number }> }
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** The last `n` month keys ending at `now` (oldest first), e.g. ['2026-01', …, '2026-06']. */
export function lastNMonths(n: number, now: Date): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push(monthKey(d))
  }
  return out
}

type StatusCount = { status: string; count: number }
type MoneyPoint = { amount: number; at: Date }

export function buildStats(statusCounts: StatusCount[], money: MoneyPoint[], now: Date): PartyStats {
  const by = new Map(statusCounts.map((s) => [s.status, s.count]))
  const active = by.get('active') ?? 0
  const completed = by.get('completed') ?? 0
  const cancelled = by.get('cancelled') ?? 0
  const total = statusCounts.reduce((n, s) => n + s.count, 0)
  const ended = completed + cancelled
  const successRate = ended > 0 ? Math.round((completed / ended) * 100) : null

  const months = lastNMonths(6, now)
  const sums = new Map(months.map((m) => [m, 0]))
  let totalMoney = 0
  for (const e of money) {
    totalMoney += e.amount
    const k = monthKey(e.at)
    if (sums.has(k)) sums.set(k, (sums.get(k) ?? 0) + e.amount)
  }
  return {
    contracts: { total, active, completed, cancelled, other: total - active - completed - cancelled },
    successRate,
    money: { total: round2(totalMoney), currency: 'usd', monthly: months.map((m) => ({ month: m, amount: round2(sums.get(m) ?? 0) })) },
  }
}

const toCounts = (g: Array<{ status: string; _count: { _all: number } }>): StatusCount[] => g.map((x) => ({ status: x.status, count: x._count._all }))

/** The contractor's own financial stats (their contracts + NET earned). */
export async function contractorStats(contractorUserId: string, now = new Date()): Promise<PartyStats> {
  const [grouped, ledger] = await Promise.all([
    prisma.contract.groupBy({ by: ['status'], where: { contractorUserId }, _count: { _all: true } }),
    prisma.ledgerEntry.findMany({ where: { contractorUserId, kind: 'charge', succeeded: true }, select: { netAmount: true, occurredAt: true } }),
  ])
  return buildStats(toCounts(grouped), ledger.map((l) => ({ amount: Number(l.netAmount), at: l.occurredAt })), now)
}

/** The client's financial stats across a set of Board-owned contracts (GROSS spent; boardRef-scoped per ref). */
export async function providerClientStats(contractRefs: string[], now = new Date()): Promise<PartyStats> {
  if (contractRefs.length === 0) return buildStats([], [], now)
  const [grouped, ledger] = await Promise.all([
    prisma.contract.groupBy({ by: ['status'], where: { id: { in: contractRefs }, boardRef: { not: null } }, _count: { _all: true } }),
    prisma.ledgerEntry.findMany({ where: { contractId: { in: contractRefs }, kind: 'charge', succeeded: true }, select: { grossAmount: true, occurredAt: true } }),
  ])
  return buildStats(toCounts(grouped), ledger.map((l) => ({ amount: Number(l.grossAmount), at: l.occurredAt })), now)
}
