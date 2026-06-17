import { auth, clerkClient } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'
import { apiQuery } from '@/lib/api'
import { AdminConsole } from './admin-console'

// The platform-admin vetting console. force-dynamic: per-admin, never cached. Middleware lets admins reach
// /contractor/admin (the club gate keys on the contractor flag, which admins may not have) — we re-check here.
export const dynamic = 'force-dynamic'

type QueueRow = { id: string; clerkUserId: string; source: string; status: string; videoLink: string | null; createdAt: string }
export type Applicant = QueueRow & { name: string | null; email: string | null }
type StandingRow = { clientUserId: string; status: string; reason: string | null; activeContracts: number; suspendedAt: string | null }
export type ClientStanding = StandingRow & { name: string | null; email: string | null }
type DisputeRow = { disputeId: string; billingCycleId: string; contractId: string; contractTitle: string; amount: number; reason: string; raisedByUserId: string; raisedByRole: 'client' | 'contractor'; clientUserId: string; contractorUserId: string; card: { hasCard: boolean; brand: string | null; last4: string | null }; createdAt: string }
type Party = { name: string | null; email: string | null }
export type Dispute = DisputeRow & { client: Party; contractor: Party }

export default async function ContractorAdminPage() {
  const { userId, sessionClaims } = await auth()
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role
  if (!userId || role !== 'admin') notFound() // defense in depth; middleware already gates the route

  const [queue, standings, disputeRows] = await Promise.all([
    apiQuery<QueueRow[]>('identity.vettingQueue').catch(() => [] as QueueRow[]),
    apiQuery<StandingRow[]>('governance.clientStandings').catch(() => [] as StandingRow[]),
    apiQuery<DisputeRow[]>('payments.disputeQueue').catch(() => [] as DisputeRow[]),
  ])

  return <AdminConsole applicants={await enrich(queue ?? [])} clients={await enrichClients(standings ?? [])} disputes={await enrichDisputes(disputeRows ?? [])} />
}

/** Resolve both parties on each dispute → names/emails so the owner has the contact info to adjudicate. */
async function enrichDisputes(rows: DisputeRow[]): Promise<Dispute[]> {
  const map = new Map<string, Party>()
  const ids = [...new Set(rows.flatMap((r) => [r.clientUserId, r.contractorUserId]))]
  if (ids.length > 0) {
    try {
      const cc = await clerkClient()
      const list = await cc.users.getUserList({ userId: ids, limit: ids.length })
      for (const u of list.data) map.set(u.id, { name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || null, email: u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? null })
    } catch { /* Clerk unset/unreachable — ids only */ }
  }
  const party = (id: string): Party => map.get(id) ?? { name: null, email: null }
  return rows.map((r) => ({ ...r, client: party(r.clientUserId), contractor: party(r.contractorUserId) }))
}

/** Resolve client ids → names/emails so the owner has the contact info (per the kill-switch requirement). */
async function enrichClients(rows: StandingRow[]): Promise<ClientStanding[]> {
  const map = new Map<string, { name: string | null; email: string | null }>()
  if (rows.length > 0) {
    try {
      const cc = await clerkClient()
      const ids = [...new Set(rows.map((r) => r.clientUserId))]
      const list = await cc.users.getUserList({ userId: ids, limit: ids.length })
      for (const u of list.data) map.set(u.id, { name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || null, email: u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? null })
    } catch { /* Clerk unset/unreachable — ids only */ }
  }
  return rows.map((r) => ({ ...r, name: map.get(r.clientUserId)?.name ?? null, email: map.get(r.clientUserId)?.email ?? null }))
}

/** Best-effort identity resolution — one batched Clerk lookup so the admin sees names/emails, not raw ids.
 *  Degrades to ids when Clerk is unset/unreachable (local dev). */
async function enrich(queue: QueueRow[]): Promise<Applicant[]> {
  const map = new Map<string, { name: string | null; email: string | null }>()
  if (queue.length > 0) {
    try {
      const cc = await clerkClient()
      const ids = [...new Set(queue.map((q) => q.clerkUserId))]
      const list = await cc.users.getUserList({ userId: ids, limit: ids.length })
      for (const u of list.data) {
        map.set(u.id, {
          name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || null,
          email: u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? null,
        })
      }
    } catch {
      /* Clerk unset (local) or lookup failed — fall back to ids only */
    }
  }
  return queue.map((q) => ({ ...q, name: map.get(q.clerkUserId)?.name ?? null, email: map.get(q.clerkUserId)?.email ?? null }))
}
