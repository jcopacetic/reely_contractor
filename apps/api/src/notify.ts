/**
 * notify — fans a CURATED set of ceremony events into the (pre-existing, user-scoped) `notification` table,
 * always to the COUNTERPARTY (the actor never notifies themselves). Display data rides in the row's `payload`
 * JSON (contractId / contractTitle / title / ceremony). Called fire-and-forget from emit(), so it never adds
 * latency to — or can fail — the action that triggered it. The in-app bell + the (later) email digest both
 * read these rows. Recipient: a contractor-actor notifies the client; a client/system actor notifies the
 * contractor.
 */
import { prisma } from '@contractor/db'

type Notifiable = { ceremony: string; title: string }

/** The only events that produce a notification — meaningful state changes, not every edit (keeps the bell quiet). */
const NOTIFY: Record<string, Notifiable> = {
  'standup.posted': { ceremony: 'standup', title: 'New stand-up posted' },
  'standup.requested': { ceremony: 'standup', title: 'A stand-up was requested' },
  'sprint.proposed': { ceremony: 'sprint', title: 'New sprint proposed' },
  'sprint.agreed': { ceremony: 'sprint', title: 'Sprint agreed' },
  'sprint.submitted': { ceremony: 'sprint', title: 'Sprint delivered for review' },
  'sprint.accepted': { ceremony: 'sprint', title: 'Sprint accepted' },
  'sprint.changes_requested': { ceremony: 'sprint', title: 'Changes requested on a sprint' },
  'blocker.raised': { ceremony: 'blocker', title: 'Blocker raised' },
  'blocker.resolved': { ceremony: 'blocker', title: 'Blocker resolved' },
  'change_request.proposed': { ceremony: 'change_request', title: 'New change request' },
  'change_request.agreed': { ceremony: 'change_request', title: 'Change request agreed' },
  'charter.kicked_off': { ceremony: 'charter', title: 'Kickoff charter agreed' },
  'charter.closed_out': { ceremony: 'charter', title: 'Contract closed out' },
}

export function isNotifiable(type: string): boolean {
  return type in NOTIFY
}

/** Write a notification for the counterparty of `actorRole` on the contract carried in the event payload. */
export async function notifyForEvent(type: string, actorRole: string, payload: unknown): Promise<void> {
  const meta = NOTIFY[type]
  if (!meta) return
  const contractId = (payload as { contractId?: unknown })?.contractId
  if (typeof contractId !== 'string') return
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { clientUserId: true, contractorUserId: true, title: true } })
  if (!c) return
  // A contractor-actor notifies the client; a client/system actor notifies the contractor.
  const recipientUserId = actorRole === 'contractor' ? c.clientUserId : c.contractorUserId
  await prisma.notification.create({
    data: {
      userId: recipientUserId,
      type,
      payload: { contractId, contractTitle: c.title, ceremony: meta.ceremony, title: meta.title, actorRole },
    },
  })
}
