/**
 * contracts store — the hire's living container (`contract`) + its expandable parts (`contract_item`).
 * A contract is created on a Board hire (provider) or a native bid accept; `contract.id` is the stable
 * contract_ref Board grants against. Participant-scoped (client + the vetted contractor). This module
 * writes ONLY contract/contract_item (the bid-accept stays in marketplace). Raw prisma + app-layer scoping.
 */
import { prisma } from '@contractor/db'
import { emit } from '../../events'
import { getUserEmail } from '../../clerk'
import { sendEmail } from '../../clients/resend'
import { stripeConfigured } from '../../clients/stripe'
import { notifyNow } from '../../notify-now'
import { env } from '../../env'

export const MAX_ITEMS_PER_CONTRACT = 500

type BudgetType = 'hourly' | 'fixed'
type ContractStatus = 'active' | 'paused' | 'completed' | 'cancelled'
type ItemKind = 'milestone' | 'scope_add' | 'deliverable' | 'note'
type ItemStatus = 'open' | 'done' | 'void'

export type ContractItemView = { id: string; kind: ItemKind; title: string; description: string | null; amount: number | null; status: ItemStatus; order: number; createdAt: string }
export type ContractView = {
  id: string
  listingId: string | null
  listingTitle: string | null
  clientUserId: string
  contractorUserId: string
  boardRef: string | null
  title: string
  rateType: BudgetType
  rateAmount: number
  status: ContractStatus
  definitionOfDone: string | null
  standupRequestedAt: string | null
  standupCadence: string | null
  startedAt: string
  endedAt: string | null
  role: 'client' | 'contractor'
  items: ContractItemView[]
}

export const toItem = (i: { id: string; kind: string; title: string; description: string | null; amount: unknown; status: string; order: number; createdAt: Date }): ContractItemView => ({
  id: i.id, kind: i.kind as ItemKind, title: i.title, description: i.description, amount: i.amount == null ? null : Number(i.amount), status: i.status as ItemStatus, order: i.order, createdAt: i.createdAt.toISOString(),
})

// ── creation ────────────────────────────────────────────────────────────────────
export type CreateContractInput = { listingId?: string | null; clientUserId: string; contractorUserId: string; boardRef?: string | null; title: string; rateType: BudgetType; rateAmount: number }

/** Core create. Emits contract.created (lets Board mint its grant; the contractor's first_contract later). */
/** Card-on-file gate: in LIVE Stripe mode a contract can't start until the client has a verified card to charge.
 *  Stub/dev mode skips it (the weekly cycle charges in stub without a real card, so the flow stays usable). */
export async function clientHasCardOnFile(clientUserId: string): Promise<boolean> {
  if (!stripeConfigured()) return true
  const b = await prisma.clientBilling.findUnique({ where: { clientUserId }, select: { status: true, defaultPaymentMethodId: true } })
  return b?.status === 'ready' && !!b.defaultPaymentMethodId
}

export async function createContract(input: CreateContractInput): Promise<{ contractId: string } | { error: string }> {
  if (!(await clientHasCardOnFile(input.clientUserId))) return { error: 'no_card_on_file' }
  const c = await prisma.contract.create({
    data: {
      listingId: input.listingId ?? null,
      clientUserId: input.clientUserId,
      contractorUserId: input.contractorUserId,
      boardRef: input.boardRef ?? null,
      title: input.title.trim() || 'Contract',
      rateType: input.rateType as never,
      rateAmount: input.rateAmount,
    },
    select: { id: true },
  })
  await emit('contracts', 'contract.created', input.contractorUserId, { contractId: c.id, clientUserId: input.clientUserId, contractorUserId: input.contractorUserId, boardRef: input.boardRef ?? null }, 'contractor')
  // "You're hired": the contract is the concrete hire moment (covers a Board-direct hire that never had a bid
  // accept). Notify the contractor — high-signal, one recipient. Email + in-app. (The allow-list's counterparty
  // routing would mis-target the client, so this is explicit.)
  await notifyNow(input.contractorUserId, {
    type: 'contract.created',
    title: `You’re hired — “${input.title.trim() || 'Contract'}”`,
    subject: 'You’ve been hired on Reely',
    lines: [
      `A contract is now active: “${input.title.trim() || 'Contract'}”.`,
      'Open it to review the scope and rate, then start logging time when you begin.',
    ],
    ctaHref: `${env.APP_BASE_URL}/contractor/contracts`,
    ctaLabel: 'View the contract',
    payload: { contractId: c.id },
  }).catch(() => {})
  return { contractId: c.id }
}

/** Create a contract from an accepted bid (idempotent per listing+contractor). Derives parties/title/rate.
 *  `requireOwnerUserId` (native path) gates to the listing owner; omit it for the service-trusted provider path. */
export async function createFromBid(bidId: string, boardRef?: string | null, requireOwnerUserId?: string): Promise<{ contractId: string } | { error: string }> {
  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
    select: { bidderUserId: true, rateType: true, amount: true, listing: { select: { id: true, ownerUserId: true, title: true } } },
  })
  if (!bid) return { error: 'bid_not_found' }
  if (requireOwnerUserId && bid.listing.ownerUserId !== requireOwnerUserId) return { error: 'forbidden' }
  const existing = await prisma.contract.findFirst({ where: { listingId: bid.listing.id, contractorUserId: bid.bidderUserId }, select: { id: true } })
  if (existing) return { contractId: existing.id } // idempotent — a re-hire returns the same contract
  return createContract({
    listingId: bid.listing.id,
    clientUserId: bid.listing.ownerUserId,
    contractorUserId: bid.bidderUserId,
    boardRef: boardRef ?? null,
    title: bid.listing.title,
    rateType: bid.rateType as BudgetType,
    rateAmount: Number(bid.amount),
  })
}

// ── reads (participant-scoped) ────────────────────────────────────────────────────
export function toView(c: { id: string; listingId: string | null; clientUserId: string; contractorUserId: string; boardRef: string | null; title: string; rateType: string; rateAmount: unknown; status: string; definitionOfDone: string | null; standupRequestedAt: Date | null; standupCadence: string | null; startedAt: Date; endedAt: Date | null; listing: { title: string } | null; items?: Parameters<typeof toItem>[0][] }, viewerUserId: string): ContractView {
  return {
    id: c.id,
    listingId: c.listingId,
    listingTitle: c.listing?.title ?? null,
    clientUserId: c.clientUserId,
    contractorUserId: c.contractorUserId,
    boardRef: c.boardRef,
    title: c.title,
    rateType: c.rateType as BudgetType,
    rateAmount: Number(c.rateAmount),
    status: c.status as ContractStatus,
    definitionOfDone: c.definitionOfDone,
    standupRequestedAt: c.standupRequestedAt ? c.standupRequestedAt.toISOString() : null,
    standupCadence: c.standupCadence,
    startedAt: c.startedAt.toISOString(),
    endedAt: c.endedAt ? c.endedAt.toISOString() : null,
    role: c.contractorUserId === viewerUserId ? 'contractor' : 'client',
    items: (c.items ?? []).map(toItem),
  }
}

/** One contract + items — participant only (client or contractor). Null otherwise (→ 404). */
export async function getContract(viewerUserId: string, id: string): Promise<ContractView | null> {
  const c = await prisma.contract.findUnique({ where: { id }, include: { listing: { select: { title: true } }, items: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } } })
  if (!c) return null
  if (c.clientUserId !== viewerUserId && c.contractorUserId !== viewerUserId) return null
  return toView(c, viewerUserId)
}

/** The viewer's contracts (either party), newest first — list cards (no items). */
export async function listMine(viewerUserId: string): Promise<ContractView[]> {
  const rows = await prisma.contract.findMany({
    where: { OR: [{ contractorUserId: viewerUserId }, { clientUserId: viewerUserId }] },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { listing: { select: { title: true } } },
  })
  return rows.map((c) => toView(c, viewerUserId))
}

// ── writes (participant-scoped) ────────────────────────────────────────────────────
async function assertParticipant(viewerUserId: string, contractId: string): Promise<{ ok: true } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { clientUserId: true, contractorUserId: true } })
  if (!c) return { error: 'not_found' }
  if (c.clientUserId !== viewerUserId && c.contractorUserId !== viewerUserId) return { error: 'forbidden' }
  return { ok: true }
}

export async function addItem(viewerUserId: string, contractId: string, input: { kind: ItemKind; title: string; description?: string | null; amount?: number | null }): Promise<{ itemId: string } | { error: string }> {
  const guard = await assertParticipant(viewerUserId, contractId)
  if ('error' in guard) return guard
  const count = await prisma.contractItem.count({ where: { contractId } })
  if (count >= MAX_ITEMS_PER_CONTRACT) return { error: 'too_many_items' }
  const item = await prisma.contractItem.create({
    data: { contractId, kind: input.kind as never, title: input.title.trim(), description: input.description?.trim() || null, amount: input.amount ?? null, order: count },
    select: { id: true },
  })
  await emit('contracts', 'contract.item.added', viewerUserId, { contractId, itemId: item.id })
  return { itemId: item.id }
}

const TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  active: ['paused', 'completed', 'cancelled'],
  paused: ['active', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

// ── pause / resume (a normal client control; pausing stops the clock + notifies both parties) ──────────
type PauseContract = { clientUserId: string; contractorUserId: string; title: string; status: string }

/** Minimal HTML-escape for user-controlled text (contract title, first name) interpolated into email HTML. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function pauseNotify(contractId: string, title: string, clientUserId: string, contractorUserId: string, paused: boolean): Promise<void> {
  const titleLine = paused ? `“${title}” was paused` : `“${title}” was resumed`
  const lines = paused
    ? [`The contract “${title}” has been paused. Time tracking is on hold until it’s resumed.`]
    : [`The contract “${title}” has been resumed. Work and time tracking are active again.`]
  for (const uid of [clientUserId, contractorUserId]) {
    await prisma.notification.create({ data: { userId: uid, type: paused ? 'contract.paused' : 'contract.resumed', payload: { ceremony: 'account', title: titleLine, contractId }, emailedAt: new Date() } }).catch(() => {})
    const who = await getUserEmail(uid).catch(() => null)
    if (who) await sendEmail({ to: who.email, subject: titleLine, html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.55"><p>Hi ${esc(who.firstName ?? 'there')},</p>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}<p style="color:#888">— Reely</p></div>`, text: [`Hi ${who.firstName ?? 'there'},`, '', ...lines, '', '— Reely'].join('\n') }).catch(() => {})
  }
}

async function applyPause(c: PauseContract, contractId: string, actorUserId: string, paused: boolean): Promise<{ ok: true } | { error: string }> {
  const to: ContractStatus = paused ? 'paused' : 'active'
  if (c.status === to) return { ok: true } // idempotent
  if (!TRANSITIONS[c.status as ContractStatus].includes(to)) return { error: 'bad_transition' } // can't pause a closed contract
  await prisma.contract.update({ where: { id: contractId }, data: { status: to as never } })
  if (paused) {
    // Stop any running timer on this contract — pausing disables the clock immediately.
    const open = await prisma.timeEntry.findMany({ where: { contractId, endedAt: null }, select: { id: true, startedAt: true } })
    const now = new Date()
    for (const e of open) {
      const dur = Math.min(86_400, Math.max(0, Math.floor((now.getTime() - e.startedAt.getTime()) / 1000)))
      await prisma.timeEntry.update({ where: { id: e.id }, data: { endedAt: now, durationSeconds: dur } })
    }
  }
  await emit('contracts', paused ? 'contract.paused' : 'contract.resumed', actorUserId, { contractId })
  await pauseNotify(contractId, c.title, c.clientUserId, c.contractorUserId, paused)
  return { ok: true }
}

/** A participant pauses/resumes a contract. Pausing stops the running clock + notifies both parties. */
export async function setPaused(viewerUserId: string, contractId: string, paused: boolean): Promise<{ ok: true } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { clientUserId: true, contractorUserId: true, title: true, status: true } })
  if (!c) return { error: 'not_found' }
  if (c.clientUserId !== viewerUserId && c.contractorUserId !== viewerUserId) return { error: 'forbidden' }
  return applyPause(c, contractId, viewerUserId, paused)
}

/** The Board client pauses/resumes a Board-originated contract (boardRef-scoped). */
export async function providerSetPaused(contractRef: string, paused: boolean): Promise<{ ok: true } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractRef }, select: { boardRef: true, clientUserId: true, contractorUserId: true, title: true, status: true } })
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  return applyPause(c, contractRef, 'system', paused)
}

export async function updateStatus(viewerUserId: string, contractId: string, to: ContractStatus): Promise<{ ok: true } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { clientUserId: true, contractorUserId: true, status: true } })
  if (!c) return { error: 'not_found' }
  if (c.clientUserId !== viewerUserId && c.contractorUserId !== viewerUserId) return { error: 'forbidden' }
  if (!TRANSITIONS[c.status as ContractStatus].includes(to)) return { error: 'bad_transition' }
  await prisma.contract.update({ where: { id: contractId }, data: { status: to as never, ...(to === 'completed' || to === 'cancelled' ? { endedAt: new Date() } : {}) } })
  await emit('contracts', 'contract.status.changed', viewerUserId, { contractId, to })
  return { ok: true }
}

/** Set the contract's Definition of Done (the acceptance bar). Participant-gated; the contractor drafts it,
 *  both parties see it. A mutual client-agree lock lands with the client-side ceremony surface. */
export async function setDefinitionOfDone(viewerUserId: string, contractId: string, text: string): Promise<{ ok: true } | { error: string }> {
  const guard = await assertParticipant(viewerUserId, contractId)
  if ('error' in guard) return guard
  await prisma.contract.update({ where: { id: contractId }, data: { definitionOfDone: text.trim().slice(0, 4000) || null } })
  await emit('contracts', 'contract.dod.set', viewerUserId, { contractId })
  return { ok: true }
}

// ── provider surface (Board, service-key; resource-scoped to Board-originated contracts) ───────────
export async function providerCreateContract(input: { listingRef?: string | null; bidRef?: string | null; contractorUserId: string; boardRef?: string | null }): Promise<{ contractRef: string } | { error: string }> {
  if (input.bidRef) {
    const r = await createFromBid(input.bidRef, input.boardRef)
    return 'error' in r ? r : { contractRef: r.contractId }
  }
  // direct contract from a listing (no bid) — derive client + title + rate from the listing.
  if (!input.listingRef) return { error: 'bid_or_listing_required' }
  const l = await prisma.listing.findUnique({ where: { id: input.listingRef }, select: { ownerUserId: true, title: true, budgetType: true, budgetAmount: true } })
  if (!l) return { error: 'listing_not_found' }
  const r = await createContract({
    listingId: input.listingRef,
    clientUserId: l.ownerUserId,
    contractorUserId: input.contractorUserId,
    boardRef: input.boardRef ?? null,
    title: l.title,
    rateType: l.budgetType as BudgetType,
    rateAmount: l.budgetAmount == null ? 0 : Number(l.budgetAmount),
  })
  return 'error' in r ? r : { contractRef: r.contractId }
}

/** A Board-originated contract + items, for Board. Scoped: only contracts carrying a boardRef. */
export async function providerGetContract(contractRef: string): Promise<ContractView | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractRef }, include: { listing: { select: { title: true } }, items: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } } })
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  return toView(c, c.clientUserId)
}
