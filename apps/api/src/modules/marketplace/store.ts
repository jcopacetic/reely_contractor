/**
 * marketplace store — listing + bid data authority behind the job-feed and the Board hire seam. USER-SCOPED:
 * a listing's owner is `ownerUserId` (a native vetted contractor subcontracting, OR a Board member via the
 * provider surface, carrying an opaque boardPartRef). Bids are participant-scoped (bidder + listing owner).
 * Bid lifecycle: submitted → countered | denied | accepted | withdrawn (countered → accepted|denied|withdrawn).
 * `acceptBid` fills the listing + emits bid.accepted; the actual Contract is the contracts module's job (later).
 * Raw `prisma` + app-layer scoping (the api connects as owner → RLS is the defense-in-depth baseline).
 */
import { prisma } from '@contractor/db'
import { emit } from '../../events'
import { inAppEnabled } from '../notifications/store'

export const MAX_BIDS_PER_LISTING = 100

type BudgetType = 'hourly' | 'fixed'
type ListingStatus = 'open' | 'closed' | 'filled'
type BidStatus = 'submitted' | 'countered' | 'denied' | 'accepted' | 'withdrawn'

export type ListingView = {
  id: string
  ownerUserId: string
  boardPartRef: string | null
  title: string
  description: string
  categoryIds: string[]
  budgetType: BudgetType
  budgetAmount: number | null
  status: ListingStatus
  createdAt: string
  bidCount: number
  isOwner: boolean
}
export type BidView = {
  id: string
  listingId: string
  bidder: { userId: string; displayName: string; avatarUrl: string | null; publicSlug: string | null } | null
  rateType: BudgetType
  amount: number
  hoursEstimate: number | null
  message: string | null
  status: BidStatus
  createdAt: string
}

/** Nullable decimal/scalar → number (null passes through). Exported for unit tests. */
export const num = (d: { toString(): string } | null): number | null => (d == null ? null : Number(d))

export async function bidCounts(listingIds: string[]): Promise<Map<string, number>> {
  if (!listingIds.length) return new Map()
  const groups = await prisma.bid.groupBy({ by: ['listingId'], where: { listingId: { in: listingIds }, status: { in: ['submitted', 'countered'] } }, _count: { _all: true } })
  return new Map(groups.map((g) => [g.listingId, g._count._all]))
}

export function toListingView(l: { id: string; ownerUserId: string; boardPartRef: string | null; title: string; description: string; categoryIds: string[]; budgetType: string; budgetAmount: unknown; status: string; createdAt: Date }, viewerUserId: string, bidCount: number): ListingView {
  return {
    id: l.id,
    ownerUserId: l.ownerUserId,
    boardPartRef: l.boardPartRef,
    title: l.title,
    description: l.description,
    categoryIds: l.categoryIds,
    budgetType: l.budgetType as BudgetType,
    budgetAmount: num(l.budgetAmount as never),
    status: l.status as ListingStatus,
    createdAt: l.createdAt.toISOString(),
    bidCount,
    isOwner: l.ownerUserId === viewerUserId,
  }
}

// ── Listings ──────────────────────────────────────────────────────────────────────
export type CreateListingInput = { title: string; description: string; categoryIds: string[]; budgetType: BudgetType; budgetAmount?: number | null; boardPartRef?: string | null; invitedUserIds?: string[] }

/** Create a listing owned by `ownerUserId`. actorType 'client' for Board-provider posts, 'contractor' for native.
 *  `invitedUserIds` (≤3) directly invites contractors — they're recorded on the listing + notified, and can bid. */
export async function createListing(ownerUserId: string, input: CreateListingInput, actorType: 'contractor' | 'client' = 'contractor'): Promise<{ listingId: string }> {
  const invited = [...new Set((input.invitedUserIds ?? []).filter(Boolean))].slice(0, 3)
  const listing = await prisma.listing.create({
    data: {
      ownerUserId,
      title: input.title.trim(),
      description: input.description.trim(),
      categoryIds: [...new Set(input.categoryIds)],
      invitedUserIds: invited,
      budgetType: input.budgetType as never,
      budgetAmount: input.budgetAmount ?? null,
      boardPartRef: input.boardPartRef ?? null,
    },
    select: { id: true, boardPartRef: true, title: true },
  })
  await emit('marketplace', 'listing.posted', ownerUserId, { listingId: listing.id, boardPartRef: listing.boardPartRef }, actorType)
  // Notify each directly-invited contractor (in-app; respects their hire-category pref). Fire-and-forget.
  for (const uid of invited) {
    if (await inAppEnabled(uid, 'hire')) {
      await prisma.notification.create({
        data: { userId: uid, type: 'listing.invited', payload: { ceremony: 'invite', title: `You've been invited to bid: ${listing.title}`, listingId: listing.id } },
      }).catch(() => {})
    }
  }
  return { listingId: listing.id }
}

/** A listing's detail for a participant (owner or any vetted browser). Null when soft-deleted/missing. */
export async function getListing(viewerUserId: string, listingId: string): Promise<ListingView | null> {
  const l = await prisma.listing.findFirst({ where: { id: listingId, deletedAt: null } })
  if (!l) return null
  const counts = await bidCounts([l.id])
  return toListingView(l, viewerUserId, counts.get(l.id) ?? 0)
}

/** The owner's own listings (newest first). */
export async function listMine(ownerUserId: string): Promise<ListingView[]> {
  const rows = await prisma.listing.findMany({ where: { ownerUserId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 })
  const counts = await bidCounts(rows.map((r) => r.id))
  return rows.map((r) => toListingView(r, ownerUserId, counts.get(r.id) ?? 0))
}

/** Owner closes a listing (no more bids). */
export async function closeListing(ownerUserId: string, listingId: string): Promise<{ ok: true } | { error: string }> {
  const l = await prisma.listing.findFirst({ where: { id: listingId, deletedAt: null }, select: { ownerUserId: true, status: true } })
  if (!l) return { error: 'not_found' }
  if (l.ownerUserId !== ownerUserId) return { error: 'forbidden' }
  await prisma.listing.update({ where: { id: listingId }, data: { status: 'closed', closedAt: new Date() } })
  return { ok: true }
}

// ── Bids ────────────────────────────────────────────────────────────────────────
async function hydrateBids(rows: Array<{ id: string; listingId: string; bidderUserId: string; rateType: string; amount: unknown; hoursEstimate: unknown; message: string | null; status: string; createdAt: Date }>): Promise<BidView[]> {
  if (!rows.length) return []
  const bidderIds = [...new Set(rows.map((r) => r.bidderUserId))]
  const profiles = await prisma.contractorProfile.findMany({ where: { clerkUserId: { in: bidderIds } }, select: { clerkUserId: true, displayName: true, avatarUrl: true, publicSlug: true } })
  const byUser = new Map(profiles.map((p) => [p.clerkUserId, p]))
  return rows.map((r) => {
    const p = byUser.get(r.bidderUserId)
    return {
      id: r.id,
      listingId: r.listingId,
      bidder: p ? { userId: p.clerkUserId, displayName: p.displayName, avatarUrl: p.avatarUrl, publicSlug: p.publicSlug } : null,
      rateType: r.rateType as BudgetType,
      amount: Number(r.amount),
      hoursEstimate: num(r.hoursEstimate as never),
      message: r.message,
      status: r.status as BidStatus,
      createdAt: r.createdAt.toISOString(),
    }
  })
}

export type SubmitBidInput = { rateType: BudgetType; amount: number; hoursEstimate?: number | null; message?: string | null }

/** A vetted contractor bids on an open listing. One can't bid on their own listing; caps at MAX_BIDS. */
export async function submitBid(bidderUserId: string, listingId: string, input: SubmitBidInput): Promise<{ bidId: string } | { error: string }> {
  const l = await prisma.listing.findFirst({ where: { id: listingId, deletedAt: null }, select: { ownerUserId: true, status: true } })
  if (!l) return { error: 'not_found' }
  if (l.status !== 'open') return { error: 'not_open' }
  if (l.ownerUserId === bidderUserId) return { error: 'own_listing' }
  const active = await prisma.bid.count({ where: { listingId, status: { in: ['submitted', 'countered'] } } })
  if (active >= MAX_BIDS_PER_LISTING) return { error: 'too_many_bids' }
  const bid = await prisma.bid.create({
    data: { listingId, bidderUserId, rateType: input.rateType as never, amount: input.amount, hoursEstimate: input.hoursEstimate ?? null, message: input.message?.trim() || null },
    select: { id: true },
  })
  await emit('marketplace', 'bid.submitted', bidderUserId, { listingId, bidId: bid.id })
  return { bidId: bid.id }
}

/** The bidder withdraws their own (still-active) bid. */
export async function withdrawBid(bidderUserId: string, bidId: string): Promise<{ ok: true } | { error: string }> {
  const b = await prisma.bid.findUnique({ where: { id: bidId }, select: { bidderUserId: true, status: true } })
  if (!b) return { error: 'not_found' }
  if (b.bidderUserId !== bidderUserId) return { error: 'forbidden' }
  if (b.status !== 'submitted' && b.status !== 'countered') return { error: 'not_active' }
  await prisma.bid.update({ where: { id: bidId }, data: { status: 'withdrawn' } })
  return { ok: true }
}

/** Internal owner-or-service bid transition. `byOwner` null = provider/service path (trusted, scope = Board-originated). */
async function transitionBid(bidId: string, to: BidStatus, ownerUserId: string | null): Promise<{ listingId: string; bidderUserId: string; ownerUserId: string } | { error: string }> {
  const b = await prisma.bid.findUnique({ where: { id: bidId }, select: { status: true, bidderUserId: true, listing: { select: { id: true, ownerUserId: true, boardPartRef: true } } } })
  if (!b) return { error: 'not_found' }
  if (ownerUserId === null) {
    // provider path: only Board-originated listings
    if (!b.listing.boardPartRef) return { error: 'forbidden' }
  } else if (b.listing.ownerUserId !== ownerUserId) {
    return { error: 'forbidden' }
  }
  if (b.status !== 'submitted' && b.status !== 'countered') return { error: 'not_active' }
  if (to === 'countered' && b.status !== 'submitted') return { error: 'bad_transition' }
  await prisma.bid.update({ where: { id: bidId }, data: { status: to as never } })
  return { listingId: b.listing.id, bidderUserId: b.bidderUserId, ownerUserId: b.listing.ownerUserId }
}

/** Owner counters a bid → status countered; the negotiation continues in the hire-loop thread (messaging, later). */
export async function counterBid(ownerUserId: string | null, bidId: string): Promise<{ ok: true } | { error: string }> {
  const r = await transitionBid(bidId, 'countered', ownerUserId)
  if ('error' in r) return r
  await emit('marketplace', 'bid.countered', r.ownerUserId, { bidId, listingId: r.listingId }, ownerUserId === null ? 'client' : 'contractor')
  return { ok: true }
}

/** Owner denies a bid. */
export async function denyBid(ownerUserId: string | null, bidId: string): Promise<{ ok: true } | { error: string }> {
  const r = await transitionBid(bidId, 'denied', ownerUserId)
  if ('error' in r) return r
  await emit('marketplace', 'bid.denied', r.ownerUserId, { bidId, listingId: r.listingId }, ownerUserId === null ? 'client' : 'contractor')
  return { ok: true }
}

/** Owner accepts a bid → bid accepted + listing filled + emit bid.accepted (the contracts module forms the Contract). */
export async function acceptBid(ownerUserId: string | null, bidId: string): Promise<{ ok: true } | { error: string }> {
  const r = await transitionBid(bidId, 'accepted', ownerUserId)
  if ('error' in r) return r
  await prisma.listing.update({ where: { id: r.listingId }, data: { status: 'filled' } })
  await emit('marketplace', 'bid.accepted', r.ownerUserId, { bidId, listingId: r.listingId, bidderUserId: r.bidderUserId }, ownerUserId === null ? 'client' : 'contractor')
  return { ok: true }
}

/** All bids for a listing, owner-only. */
export async function getBidsForListing(ownerUserId: string, listingId: string): Promise<{ bids: BidView[] } | { error: string }> {
  const l = await prisma.listing.findFirst({ where: { id: listingId, deletedAt: null }, select: { ownerUserId: true } })
  if (!l) return { error: 'not_found' }
  if (l.ownerUserId !== ownerUserId) return { error: 'forbidden' }
  const rows = await prisma.bid.findMany({ where: { listingId }, orderBy: { createdAt: 'desc' } })
  return { bids: await hydrateBids(rows) }
}

/** The caller's own bids (their proposal history), newest first, with a light listing summary. */
export async function myBids(bidderUserId: string): Promise<Array<BidView & { listing: { id: string; title: string; status: ListingStatus } }>> {
  const rows = await prisma.bid.findMany({ where: { bidderUserId }, orderBy: { createdAt: 'desc' }, take: 100, include: { listing: { select: { id: true, title: true, status: true } } } })
  const views = await hydrateBids(rows)
  const byId = new Map(views.map((v) => [v.id, v]))
  return rows.flatMap((r) => {
    const v = byId.get(r.id)
    return v ? [{ ...v, listing: { id: r.listing.id, title: r.listing.title, status: r.listing.status as ListingStatus } }] : []
  })
}

// ── Provider surface (Board, service-key; resource-scoped to Board-originated listings) ─────────────
export async function providerCreateListing(input: CreateListingInput & { ownerUserId: string }): Promise<{ listingRef: string }> {
  const { listingId } = await createListing(input.ownerUserId, input, 'client')
  return { listingRef: listingId }
}

/** The active skill-category vocab — exposed to Board (provider) so the hire panel can tag a job for
 *  feed matching. Public-safe (id + name + slug only). */
export async function providerSkillCategories(): Promise<Array<{ id: string; name: string; slug: string }>> {
  return prisma.skillCategory.findMany({ where: { active: true }, orderBy: { order: 'asc' }, select: { id: true, name: true, slug: true } })
}

export type BidStats = { count: number; avgAmount: number | null; avgHours: number | null }

/** Bids for a Board-originated listing + aggregate stats. Scoped: only listings carrying a boardPartRef. */
export async function providerListBids(listingRef: string): Promise<{ bids: BidView[]; stats: BidStats } | { error: string }> {
  const l = await prisma.listing.findFirst({ where: { id: listingRef, deletedAt: null }, select: { boardPartRef: true } })
  if (!l) return { error: 'not_found' }
  if (!l.boardPartRef) return { error: 'forbidden' } // never expose native listings via the provider surface
  const rows = await prisma.bid.findMany({ where: { listingId: listingRef }, orderBy: { createdAt: 'desc' } })
  const bids = await hydrateBids(rows)
  const active = bids.filter((b) => b.status === 'submitted' || b.status === 'countered')
  const stats: BidStats = {
    count: active.length,
    avgAmount: active.length ? active.reduce((s, b) => s + b.amount, 0) / active.length : null,
    avgHours: active.filter((b) => b.hoursEstimate != null).length ? active.reduce((s, b) => s + (b.hoursEstimate ?? 0), 0) / active.filter((b) => b.hoursEstimate != null).length : null,
  }
  return { bids, stats }
}
