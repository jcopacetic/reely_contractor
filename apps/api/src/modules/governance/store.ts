/**
 * governance — the client/contractor standing kill-switches. The owner (or an automatic charge decline) can
 * suspend a CLIENT (their contractors can't clock time, running timers stop, both sides are notified) or disable
 * a CONTRACTOR (reuses contractor_identity.status='suspended'; their clients are alerted). Standing is the SOURCE
 * OF TRUTH — we never clobber per-contract status, so reinstating cleanly restores everything. Governance events
 * are high-signal, so notifications go out BOTH in-app and as an immediate transactional email (not the digest).
 */
import { prisma } from '@contractor/db'
import { emit } from '../../events'
import { getUserEmail } from '../../clerk'
import { setContractorFlag } from '../../clerk'
import { sendEmail } from '../../clients/resend'

const STOP_CAP_SECONDS = 86_400

export const CLIENT_REASONS = ['payment_declined', 'non_payment', 'abuse', 'terms_violation', 'request', 'other'] as const
export const CONTRACTOR_REASONS = ['conduct', 'quality', 'inactivity', 'terms_violation', 'request', 'other'] as const
const REASON_LABEL: Record<string, string> = {
  payment_declined: 'a declined payment', non_payment: 'non-payment', abuse: 'a terms/abuse concern', terms_violation: 'a terms violation',
  conduct: 'a conduct concern', quality: 'a quality concern', inactivity: 'inactivity', request: 'a request', other: 'an account review',
}
const labelFor = (r?: string | null) => (r ? REASON_LABEL[r] ?? 'an account review' : 'an account review')

// ── notification + transactional email (governance is immediate, not digested) ────────────
async function pushInApp(userId: string, title: string, contractId?: string | null): Promise<void> {
  await prisma.notification.create({
    data: { userId, type: 'account.standing', payload: { ceremony: 'account', title, ...(contractId ? { contractId } : {}) }, emailedAt: new Date() },
  }).catch(() => {})
}
async function pushEmail(userId: string, subject: string, lines: string[]): Promise<void> {
  const who = await getUserEmail(userId)
  if (!who) return
  const text = [`Hi ${who.firstName ?? 'there'},`, '', ...lines, '', '— Reely'].join('\n')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.55;max-width:520px"><p>Hi ${who.firstName ?? 'there'},</p>${lines.map((l) => `<p>${l}</p>`).join('')}<p style="color:#888">— Reely</p></div>`
  await sendEmail({ to: who.email, subject, html, text })
}

// ── the disabled-reason gate (the timer write calls this) ─────────────────────────────────
/** Why a contract can't be worked right now, or null if it's clear. Standing-derived (no contract mutation). */
export async function disabledReasonFor(parties: { clientUserId: string; contractorUserId: string; status: string }): Promise<string | null> {
  if (parties.status === 'paused') return 'contract_paused'
  if (parties.status !== 'active') return 'contract_not_active'
  const [client, contractor] = await Promise.all([
    prisma.clientStanding.findUnique({ where: { clientUserId: parties.clientUserId }, select: { status: true } }),
    prisma.contractorIdentity.findUnique({ where: { clerkUserId: parties.contractorUserId }, select: { status: true } }),
  ])
  if (client?.status === 'suspended') return 'client_suspended'
  if (contractor?.status === 'suspended') return 'contractor_suspended'
  return null
}

async function stopOpenTimers(where: { clientUserId?: string; contractorUserId?: string }): Promise<void> {
  const contracts = await prisma.contract.findMany({ where: { ...where, status: 'active' }, select: { id: true } })
  if (contracts.length === 0) return
  const open = await prisma.timeEntry.findMany({ where: { contractId: { in: contracts.map((c) => c.id) }, endedAt: null }, select: { id: true, startedAt: true } })
  const now = new Date()
  for (const e of open) {
    const dur = Math.min(STOP_CAP_SECONDS, Math.max(0, Math.floor((now.getTime() - e.startedAt.getTime()) / 1000)))
    await prisma.timeEntry.update({ where: { id: e.id }, data: { endedAt: now, durationSeconds: dur } })
  }
}

// ── client kill-switch ────────────────────────────────────────────────────────────────────
export async function suspendClient(adminId: string | null, clientUserId: string, reason: string, note: string | null, source: 'manual' | 'auto_decline'): Promise<{ ok: true } | { error: string }> {
  const existing = await prisma.clientStanding.findUnique({ where: { clientUserId }, select: { status: true } })
  if (existing?.status === 'suspended') return { ok: true } // idempotent (auto-decline may fire repeatedly)
  await prisma.clientStanding.upsert({
    where: { clientUserId },
    create: { clientUserId, status: 'suspended', reason, note, source, suspendedByUserId: adminId, suspendedAt: new Date() },
    update: { status: 'suspended', reason, note, source, suspendedByUserId: adminId, suspendedAt: new Date() },
  })
  await stopOpenTimers({ clientUserId })
  const contracts = await prisma.contract.findMany({ where: { clientUserId, status: 'active' }, select: { id: true, contractorUserId: true } })
  const contractors = [...new Set(contracts.map((c) => c.contractorUserId))]
  for (const cuid of contractors) {
    await pushInApp(cuid, 'A contract was paused — not your fault', contracts.find((c) => c.contractorUserId === cuid)?.id)
    await pushEmail(cuid, 'A contract was temporarily paused', ['One of your contracts has been temporarily paused on the client side while a billing matter is resolved.', 'This is not a reflection on your work, and no action is needed from you. We’ll let you know the moment it’s active again.'])
  }
  await pushInApp(clientUserId, `Your contracting is paused (${labelFor(reason)})`)
  await pushEmail(clientUserId, 'Your Reely contracting is temporarily paused', [`Your contracting has been temporarily paused due to ${labelFor(reason)}.`, 'Any active timers were stopped and your contracts are on hold. We want to get you back up and running quickly — please resolve the outstanding item (or reply to this note) and we’ll restore access right away.'])
  await emit('governance', 'client.suspended', adminId ?? 'system', { clientUserId, reason, source }, 'system')
  return { ok: true }
}

export async function reinstateClient(adminId: string, clientUserId: string): Promise<{ ok: true } | { error: string }> {
  const existing = await prisma.clientStanding.findUnique({ where: { clientUserId }, select: { status: true } })
  if (!existing || existing.status === 'active') return { ok: true }
  await prisma.clientStanding.update({ where: { clientUserId }, data: { status: 'active', reason: null, note: null, source: null, suspendedByUserId: null, suspendedAt: null } })
  const contracts = await prisma.contract.findMany({ where: { clientUserId, status: 'active' }, select: { id: true, contractorUserId: true } })
  for (const cuid of [...new Set(contracts.map((c) => c.contractorUserId))]) {
    await pushInApp(cuid, 'A paused contract is active again', contracts.find((c) => c.contractorUserId === cuid)?.id)
    await pushEmail(cuid, 'Your contract is active again', ['Good news — a contract that was temporarily paused is active again. You can resume work and time tracking.'])
  }
  await pushInApp(clientUserId, 'Your contracting is restored')
  await pushEmail(clientUserId, 'Your Reely contracting is restored', ['Thanks for sorting that out — your contracting is active again and your contracts have resumed.'])
  await emit('governance', 'client.reinstated', adminId, { clientUserId }, 'system')
  return { ok: true }
}

/** Called from the charge-decline path — suspend the client automatically (idempotent). */
export async function autoSuspendClientOnDecline(clientUserId: string): Promise<void> {
  await suspendClient(null, clientUserId, 'payment_declined', null, 'auto_decline').catch((e) => console.error('[governance] auto-suspend failed', (e as Error).message))
}

// ── contractor kill-switch (reuses contractor_identity.status) ──────────────────────────────
export async function suspendContractor(adminId: string, contractorUserId: string, reason: string, note: string | null): Promise<{ ok: true } | { error: string }> {
  const id = await prisma.contractorIdentity.findUnique({ where: { clerkUserId: contractorUserId }, select: { status: true } })
  if (!id) return { error: 'not_found' }
  if (id.status === 'suspended') return { ok: true }
  await prisma.contractorIdentity.update({ where: { clerkUserId: contractorUserId }, data: { status: 'suspended', suspendReason: reason, suspendedAt: new Date() } })
  await setContractorFlag(contractorUserId, false)
  await stopOpenTimers({ contractorUserId })
  const contracts = await prisma.contract.findMany({ where: { contractorUserId, status: 'active' }, select: { id: true, clientUserId: true } })
  for (const cl of [...new Set(contracts.map((c) => c.clientUserId))]) {
    await pushInApp(cl, 'A contractor on your contract is temporarily unavailable', contracts.find((c) => c.clientUserId === cl)?.id)
    await pushEmail(cl, 'A contractor on your contract is temporarily unavailable', ['A contractor you’re working with is temporarily unavailable on Reely. Their time tracking is paused for now.', 'We’ll notify you as soon as they’re active again. Your other contracts are unaffected.'])
  }
  await pushInApp(contractorUserId, `Your account is suspended (${labelFor(reason)})`)
  await pushEmail(contractorUserId, 'Your Reely contractor account is suspended', [`Your contractor account has been suspended due to ${labelFor(reason)}.`, 'While suspended you can’t track time or take on work. If you think this is a mistake or want to resolve it, just reply to this note.'])
  await emit('governance', 'contractor.suspended', adminId, { contractorUserId, reason }, 'system')
  return { ok: true }
}

export async function reinstateContractor(adminId: string, contractorUserId: string): Promise<{ ok: true } | { error: string }> {
  const id = await prisma.contractorIdentity.findUnique({ where: { clerkUserId: contractorUserId }, select: { status: true } })
  if (!id) return { error: 'not_found' }
  if (id.status !== 'suspended') return { ok: true }
  await prisma.contractorIdentity.update({ where: { clerkUserId: contractorUserId }, data: { status: 'vetted', suspendReason: null, suspendedAt: null } })
  await setContractorFlag(contractorUserId, true)
  const contracts = await prisma.contract.findMany({ where: { contractorUserId, status: 'active' }, select: { id: true, clientUserId: true } })
  for (const cl of [...new Set(contracts.map((c) => c.clientUserId))]) {
    await pushInApp(cl, 'Your contractor is available again', contracts.find((c) => c.clientUserId === cl)?.id)
  }
  await pushInApp(contractorUserId, 'Your account is reinstated')
  await pushEmail(contractorUserId, 'Your Reely contractor account is reinstated', ['Your contractor account is active again — you can track time and take on work. Welcome back.'])
  await emit('governance', 'contractor.reinstated', adminId, { contractorUserId }, 'system')
  return { ok: true }
}

// ── reads ───────────────────────────────────────────────────────────────────────────────
/** A contractor's own standing (for the in-app "you're suspended" banner). */
export async function myContractorStanding(contractorUserId: string): Promise<{ suspended: boolean; reason: string | null }> {
  const id = await prisma.contractorIdentity.findUnique({ where: { clerkUserId: contractorUserId }, select: { status: true, suspendReason: true } })
  return { suspended: id?.status === 'suspended', reason: id?.suspendReason ?? null }
}

/** A client's standing for the Board side (boardRef-scoped to a contract the workspace owns). */
export async function providerClientStanding(contractRef: string): Promise<{ suspended: boolean; reason: string | null } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractRef }, select: { boardRef: true, clientUserId: true, contractorUserId: true } })
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  const [cs, ci] = await Promise.all([
    prisma.clientStanding.findUnique({ where: { clientUserId: c.clientUserId }, select: { status: true, reason: true } }),
    prisma.contractorIdentity.findUnique({ where: { clerkUserId: c.contractorUserId }, select: { status: true } }),
  ])
  // The Board cares about BOTH: is my contracting paused, and is my contractor unavailable.
  if (cs?.status === 'suspended') return { suspended: true, reason: cs.reason ?? null }
  if (ci?.status === 'suspended') return { suspended: true, reason: 'contractor_unavailable' }
  return { suspended: false, reason: null }
}

// ── admin lists ─────────────────────────────────────────────────────────────────────────
/** Clients (distinct, from contracts) + their standing + active-contract counts, for the admin console. */
export async function listClientStandings(): Promise<Array<{ clientUserId: string; status: string; reason: string | null; activeContracts: number; suspendedAt: string | null }>> {
  const grouped = await prisma.contract.groupBy({ by: ['clientUserId'], _count: { _all: true }, where: { status: 'active' } })
  const standings = await prisma.clientStanding.findMany({ select: { clientUserId: true, status: true, reason: true, suspendedAt: true } })
  const sMap = new Map(standings.map((s) => [s.clientUserId, s]))
  const ids = new Set([...grouped.map((g) => g.clientUserId), ...standings.map((s) => s.clientUserId)])
  return [...ids].map((id) => {
    const s = sMap.get(id)
    return { clientUserId: id, status: s?.status ?? 'active', reason: s?.reason ?? null, activeContracts: grouped.find((g) => g.clientUserId === id)?._count._all ?? 0, suspendedAt: s?.suspendedAt ? s.suspendedAt.toISOString() : null }
  })
}
