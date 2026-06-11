/**
 * contracts store — the hire's living container (`contract`) + its expandable parts (`contract_item`).
 * A contract is created on a Board hire (provider) or a native bid accept; `contract.id` is the stable
 * contract_ref Board grants against. Participant-scoped (client + the vetted contractor). This module
 * writes ONLY contract/contract_item (the bid-accept stays in marketplace). Raw prisma + app-layer scoping.
 */
import { prisma } from '@contractor/db'
import { emit } from '../../events'

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
  startedAt: string
  endedAt: string | null
  role: 'client' | 'contractor'
  items: ContractItemView[]
}

const toItem = (i: { id: string; kind: string; title: string; description: string | null; amount: unknown; status: string; order: number; createdAt: Date }): ContractItemView => ({
  id: i.id, kind: i.kind as ItemKind, title: i.title, description: i.description, amount: i.amount == null ? null : Number(i.amount), status: i.status as ItemStatus, order: i.order, createdAt: i.createdAt.toISOString(),
})

// ── creation ────────────────────────────────────────────────────────────────────
export type CreateContractInput = { listingId?: string | null; clientUserId: string; contractorUserId: string; boardRef?: string | null; title: string; rateType: BudgetType; rateAmount: number }

/** Core create. Emits contract.created (lets Board mint its grant; the contractor's first_contract later). */
export async function createContract(input: CreateContractInput): Promise<{ contractId: string }> {
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
function toView(c: { id: string; listingId: string | null; clientUserId: string; contractorUserId: string; boardRef: string | null; title: string; rateType: string; rateAmount: unknown; status: string; startedAt: Date; endedAt: Date | null; listing: { title: string } | null; items?: Parameters<typeof toItem>[0][] }, viewerUserId: string): ContractView {
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

export async function updateStatus(viewerUserId: string, contractId: string, to: ContractStatus): Promise<{ ok: true } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { clientUserId: true, contractorUserId: true, status: true } })
  if (!c) return { error: 'not_found' }
  if (c.clientUserId !== viewerUserId && c.contractorUserId !== viewerUserId) return { error: 'forbidden' }
  if (!TRANSITIONS[c.status as ContractStatus].includes(to)) return { error: 'bad_transition' }
  await prisma.contract.update({ where: { id: contractId }, data: { status: to as never, ...(to === 'completed' || to === 'cancelled' ? { endedAt: new Date() } : {}) } })
  await emit('contracts', 'contract.status.changed', viewerUserId, { contractId, to })
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
  const { contractId } = await createContract({
    listingId: input.listingRef,
    clientUserId: l.ownerUserId,
    contractorUserId: input.contractorUserId,
    boardRef: input.boardRef ?? null,
    title: l.title,
    rateType: l.budgetType as BudgetType,
    rateAmount: l.budgetAmount == null ? 0 : Number(l.budgetAmount),
  })
  return { contractRef: contractId }
}

/** A Board-originated contract + items, for Board. Scoped: only contracts carrying a boardRef. */
export async function providerGetContract(contractRef: string): Promise<ContractView | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractRef }, include: { listing: { select: { title: true } }, items: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } } })
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  return toView(c, c.clientUserId)
}
