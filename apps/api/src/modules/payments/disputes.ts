/**
 * disputes — the admin dispute area on top of the existing cycle-dispute mechanism. A cycle contested inside its
 * review window lands here: the owner is emailed, the counterparty is notified, and the admin console resolves it
 * (uphold → charge / waive → void). disputeQueue() gives the owner the full context (parties, amount, reason, the
 * card on file) so they can adjudicate; web enriches the user ids → names/emails via Clerk.
 */
import { prisma } from '@contractor/db'
import { getUserEmail } from '../../clerk'
import { sendEmail } from '../../clients/resend'
import { env } from '../../env'

export const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function pushInApp(userId: string, title: string, contractId?: string | null): Promise<void> {
  await prisma.notification.create({ data: { userId, type: 'billing.dispute', payload: { ceremony: 'account', title, ...(contractId ? { contractId } : {}) }, emailedAt: new Date() } }).catch(() => {})
}
async function emailUser(userId: string, subject: string, lines: string[]): Promise<void> {
  const who = await getUserEmail(userId)
  if (!who) return
  await sendEmail({ to: who.email, subject, html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;max-width:520px"><p>Hi ${who.firstName ?? 'there'},</p>${lines.map((l) => `<p>${l}</p>`).join('')}<p style="color:#888">— Reely</p></div>`, text: [`Hi ${who.firstName ?? 'there'},`, '', ...lines, '', '— Reely'].join('\n') })
}

async function cycleContext(billingCycleId: string) {
  return prisma.billingCycle.findUnique({
    where: { id: billingCycleId },
    select: { id: true, contractId: true, totalAmount: true, contract: { select: { title: true, clientUserId: true, contractorUserId: true } } },
  })
}

/** A dispute was raised in the window — email the owner + notify the counterparty (it blocks the charge). */
export async function notifyDisputeOpened(billingCycleId: string, raisedByUserId: string, reason: string): Promise<void> {
  const c = await cycleContext(billingCycleId)
  if (!c) return
  const amount = usd(Number(c.totalAmount))
  await sendEmail({
    to: env.OPS_EMAIL,
    subject: `Dispute raised — ${c.contract.title} (${amount})`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:14px"><p>A billing dispute was raised and is blocking a charge.</p><p><strong>Contract:</strong> ${c.contract.title}<br/><strong>Amount:</strong> ${amount}<br/><strong>Raised by:</strong> ${raisedByUserId}<br/><strong>Reason:</strong> ${reason}</p><p>Resolve it in the contractor admin console.</p></div>`,
    text: `Dispute raised on ${c.contract.title} (${amount}). Raised by ${raisedByUserId}. Reason: ${reason}. Resolve it in the admin console.`,
  }).catch(() => {})
  const counterparty = raisedByUserId === c.contract.clientUserId ? c.contract.contractorUserId : c.contract.clientUserId
  await pushInApp(counterparty, `A billing dispute was raised on ${c.contract.title}`, c.contractId)
  await emailUser(counterparty, 'A billing dispute was raised', [`A dispute was raised on the ${amount} invoice for ${c.contract.title}. The charge is on hold while it's reviewed — we'll let you know the outcome.`]).catch(() => {})
}

/** A dispute was resolved — tell both parties the outcome. */
export async function notifyDisputeResolved(billingCycleId: string, resolution: 'charge' | 'void'): Promise<void> {
  const c = await cycleContext(billingCycleId)
  if (!c) return
  const amount = usd(Number(c.totalAmount))
  const lines = resolution === 'charge'
    ? [`The dispute on the ${amount} invoice for ${c.contract.title} was resolved — it will proceed to charge.`]
    : [`The dispute on the ${amount} invoice for ${c.contract.title} was resolved — the invoice was waived and won't be charged.`]
  for (const uid of [c.contract.clientUserId, c.contract.contractorUserId]) {
    await pushInApp(uid, `Dispute resolved on ${c.contract.title}`, c.contractId)
    await emailUser(uid, 'Your billing dispute was resolved', lines).catch(() => {})
  }
}

export type DisputeQueueRow = {
  disputeId: string
  billingCycleId: string
  contractId: string
  contractTitle: string
  amount: number
  reason: string
  raisedByUserId: string
  raisedByRole: 'client' | 'contractor'
  clientUserId: string
  contractorUserId: string
  card: { hasCard: boolean; brand: string | null; last4: string | null }
  createdAt: string
}

/** Open disputes with the full adjudication context (the owner's dispute area). Admin-only. */
export async function disputeQueue(): Promise<DisputeQueueRow[]> {
  const disputes = await prisma.cycleDispute.findMany({
    where: { status: 'open' },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: { id: true, billingCycleId: true, raisedByUserId: true, reason: true, createdAt: true, cycle: { select: { contractId: true, totalAmount: true, contract: { select: { title: true, clientUserId: true, contractorUserId: true } } } } },
  })
  const clientIds = [...new Set(disputes.map((d) => d.cycle.contract.clientUserId))]
  const billings = clientIds.length ? await prisma.clientBilling.findMany({ where: { clientUserId: { in: clientIds } }, select: { clientUserId: true, status: true, defaultPaymentMethodId: true, cardBrand: true, cardLast4: true } }) : []
  const cardOf = new Map(billings.map((b) => [b.clientUserId, b]))
  return disputes.map((d) => {
    const b = cardOf.get(d.cycle.contract.clientUserId)
    return {
      disputeId: d.id,
      billingCycleId: d.billingCycleId,
      contractId: d.cycle.contractId,
      contractTitle: d.cycle.contract.title,
      amount: Number(d.cycle.totalAmount),
      reason: d.reason,
      raisedByUserId: d.raisedByUserId,
      raisedByRole: d.raisedByUserId === d.cycle.contract.contractorUserId ? 'contractor' : 'client',
      clientUserId: d.cycle.contract.clientUserId,
      contractorUserId: d.cycle.contract.contractorUserId,
      card: { hasCard: !!b && b.status === 'ready' && !!b.defaultPaymentMethodId, brand: b?.cardBrand ?? null, last4: b?.cardLast4 ?? null },
      createdAt: d.createdAt.toISOString(),
    }
  })
}
