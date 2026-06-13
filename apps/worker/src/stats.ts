/**
 * Contractor profile stats rollup — keeps contractor_profile.contractsCompleted + hoursLogged current. Recomputed
 * from the SOURCE OF TRUTH (count completed contracts; sum APPROVED time) rather than incrementing tallies, so an
 * un-approve / delete / status flip can't drift the numbers. Runs off the same event stream as achievements; the
 * relevant events (a contract's status changing, any time-entry change) carry the contractId we recompute for.
 */
import { prisma } from '@contractor/db'

const triggersStats = (type: string): boolean => type === 'contract.status.changed' || type.startsWith('time_entry.')

/** Recompute + persist a contractor's profile stats. No-op if they have no profile yet. */
export async function recomputeContractorStats(contractorUserId: string): Promise<void> {
  const [contractsCompleted, agg] = await Promise.all([
    prisma.contract.count({ where: { contractorUserId, status: 'completed' } }),
    prisma.timeEntry.aggregate({ where: { contractorUserId, approved: true }, _sum: { durationSeconds: true } }),
  ])
  const hoursLogged = Math.round(((agg._sum.durationSeconds ?? 0) / 3600) * 100) / 100
  await prisma.contractorProfile.updateMany({ where: { clerkUserId: contractorUserId }, data: { contractsCompleted, hoursLogged } })
}

/** Off the event stream: when a contract's status or a time entry changes, recompute that contract's contractor. */
export async function maybeRecomputeStats(data: { type?: string; payload?: unknown }): Promise<void> {
  if (!data.type || !triggersStats(data.type)) return
  const contractId = (data.payload as { contractId?: string } | null)?.contractId
  if (!contractId) return
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { contractorUserId: true } })
  if (c) await recomputeContractorStats(c.contractorUserId)
}
