/**
 * payments notices — the weekly billing cadence around the cron. Two scheduled nudges:
 *   sendNewWeekNotices()  — run on the weekly tick: tells both parties a new work week started, and emails the
 *                           client to review the time on their contracts before it bills.
 *   sendChargeReminders() — run daily: ~24h before a cycle's dispute window closes (the charge is imminent),
 *                           remind the client (bell + email) so a charge is never a surprise.
 * In-app rows + an immediate transactional email (these are low-frequency + scheduled, so not digested). Rows are
 * marked emailed so the daily digest won't re-send them. Best-effort: a notice hiccup never blocks the cron.
 */
import { prisma } from '@contractor/db'
import { getUserEmail } from '../../clerk'
import { sendEmail } from '../../clients/resend'
import { env } from '../../env'

async function pushInApp(userId: string, title: string, contractId?: string | null): Promise<void> {
  await prisma.notification.create({ data: { userId, type: 'billing.notice', payload: { ceremony: 'account', title, ...(contractId ? { contractId } : {}) }, emailedAt: new Date() } }).catch(() => {})
}
async function pushEmail(userId: string, subject: string, lines: string[]): Promise<void> {
  const who = await getUserEmail(userId)
  if (!who) return
  const text = [`Hi ${who.firstName ?? 'there'},`, '', ...lines, '', '— Reely'].join('\n')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.55;max-width:520px"><p>Hi ${who.firstName ?? 'there'},</p>${lines.map((l) => `<p>${l}</p>`).join('')}<p style="margin-top:18px"><a href="${env.APP_BASE_URL}/projects/work" style="background:#111;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;display:inline-block">Review your contracts</a></p><p style="color:#888">— Reely</p></div>`
  await sendEmail({ to: who.email, subject, html, text })
}

/**
 * Pure: collapse a list of contracts to the FIRST contract id seen per distinct key (e.g. one nudge per user,
 * not one per contract). Preserves first-occurrence order; later contracts for the same key are ignored.
 */
export function firstContractFor<C extends { id: string }>(contracts: readonly C[], pick: (c: C) => string): Map<string, string> {
  const m = new Map<string, string>()
  for (const c of contracts) if (!m.has(pick(c))) m.set(pick(c), c.id)
  return m
}

/** Weekly: a "new work week has started" ping to both parties of every active contract (client also emailed). */
export async function sendNewWeekNotices(): Promise<{ contractors: number; clients: number }> {
  const contracts = await prisma.contract.findMany({ where: { status: 'active' }, select: { id: true, clientUserId: true, contractorUserId: true } })
  if (contracts.length === 0) return { contractors: 0, clients: 0 }
  const contractorContracts = firstContractFor(contracts, (c) => c.contractorUserId)
  const clientContracts = firstContractFor(contracts, (c) => c.clientUserId)
  for (const [uid, cid] of contractorContracts) {
    await pushInApp(uid, 'A new work week has started — log and submit your time', cid)
  }
  for (const [uid, cid] of clientContracts) {
    await pushInApp(uid, 'A new work week has started — review your contractors’ time', cid)
    await pushEmail(uid, 'A new work week has started on Reely', ['A new work week has started. Please review the time your contractor(s) logged on your active contracts — approve it or flag anything before it’s billed.', 'Reviewing now keeps your weekly invoice accurate.'])
  }
  return { contractors: contractorContracts.size, clients: clientContracts.size }
}

export const REMIND_AHEAD_MS = 30 * 3_600_000 // ~24h, with slack for the daily run

/** Pure: the upper bound of the reminder window — cycles closing on/before this (and after `now`) are "imminent". */
export function remindWindowEnd(now: Date): Date {
  return new Date(now.getTime() + REMIND_AHEAD_MS)
}

/**
 * Pure: does a cycle's dispute-window close fall inside the reminder window `(now, now+REMIND_AHEAD_MS]`?
 * Mirrors the `disputeWindowEndsAt: { gt: now, lte: soon }` predicate: strictly after now, at-or-before the bound.
 */
export function isWithinReminderWindow(disputeWindowEndsAt: Date, now: Date): boolean {
  const t = disputeWindowEndsAt.getTime()
  return t > now.getTime() && t <= remindWindowEnd(now).getTime()
}

/** Daily: remind the client ~24h before a cycle's dispute window closes (the charge is imminent). Once per cycle. */
export async function sendChargeReminders(now = new Date()): Promise<{ reminded: number }> {
  const soon = remindWindowEnd(now)
  const due = await prisma.billingCycle.findMany({
    where: { status: 'dispute_window', disputeWindowEndsAt: { gt: now, lte: soon }, chargeReminderSentAt: null, totalAmount: { gt: 0 }, disputes: { none: { status: 'open' } } },
    select: { id: true, contractId: true, totalAmount: true, contract: { select: { clientUserId: true } } },
  })
  for (const c of due) {
    const amount = Number(c.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    await pushInApp(c.contract.clientUserId, `An invoice ($${amount}) is finalizing in about 24 hours`, c.contractId)
    await pushEmail(c.contract.clientUserId, 'Your Reely invoice is charged in ~24 hours', [`The weekly invoice for one of your contracts ($${amount}) will be charged in about 24 hours.`, 'If the logged time looks right, there’s nothing to do. If something’s off, review and flag it now — once the window closes it’s billed automatically.'])
    await prisma.billingCycle.update({ where: { id: c.id }, data: { chargeReminderSentAt: now } })
  }
  return { reminded: due.length }
}
