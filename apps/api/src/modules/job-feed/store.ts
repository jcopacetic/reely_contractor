/**
 * job-feed store — the v1 work feed: a READ-ONLY, vetted-only browse over open `listing` rows, filtered by
 * skill_category overlap (GIN on category_ids), budget type, and open status. Board-originated listings
 * (with a boardPartRef) render identically to native ones. All bid affordances delegate to the marketplace
 * module — this module never writes.
 */
import { prisma } from '@contractor/db'
import { bidCounts, toListingView, type ListingView } from '../marketplace/store'

export const FEED_PAGE_SIZE = 50

type BudgetType = 'hourly' | 'fixed'
export type FeedFilters = { categoryIds?: string[]; budgetType?: BudgetType; before?: string; limit?: number }

/** The viewer's own skill categories (from their profile) — the "matches my skills" default the web can pass. */
export async function viewerCategories(userId: string): Promise<string[]> {
  const p = await prisma.contractorProfile.findUnique({ where: { clerkUserId: userId }, select: { categoryIds: true } })
  const raw = p?.categoryIds
  return Array.isArray(raw) ? (raw as unknown[]).map((x) => String(x)) : []
}

/** Open listings, newest-first, keyset-paginated. No category filter ⇒ all open (so the feed isn't empty when
 *  a contractor's skills don't overlap); pass categoryIds to scope to matching work. */
export async function listListings(viewerUserId: string, opts: FeedFilters = {}): Promise<ListingView[]> {
  const limit = Math.min(Math.max(opts.limit ?? FEED_PAGE_SIZE, 1), FEED_PAGE_SIZE)
  const cats = opts.categoryIds && opts.categoryIds.length ? opts.categoryIds : undefined
  const rows = await prisma.listing.findMany({
    where: {
      status: 'open',
      deletedAt: null,
      ...(cats ? { categoryIds: { hasSome: cats } } : {}),
      ...(opts.budgetType ? { budgetType: opts.budgetType as never } : {}),
      ...(opts.before ? { createdAt: { lt: new Date(opts.before) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  const counts = await bidCounts(rows.map((r) => r.id))
  return rows.map((r) => toListingView(r, viewerUserId, counts.get(r.id) ?? 0))
}

/** Listings the viewer was DIRECTLY invited to (open), newest-first — surfaced as a top "Invited to you" section
 *  so a targeted invite isn't lost among the open feed (they were also notified). Each carries invited: true. */
export async function invitedListings(viewerUserId: string): Promise<ListingView[]> {
  const rows = await prisma.listing.findMany({
    where: { status: 'open', deletedAt: null, invitedUserIds: { has: viewerUserId } },
    orderBy: { createdAt: 'desc' },
    take: FEED_PAGE_SIZE,
  })
  const counts = await bidCounts(rows.map((r) => r.id))
  return rows.map((r) => toListingView(r, viewerUserId, counts.get(r.id) ?? 0))
}

/** One open listing's detail + whether the viewer already has an active bid on it. Null on closed/filled/missing. */
export async function getFeedListing(viewerUserId: string, listingId: string): Promise<{ listing: ListingView; myBid: { id: string; status: string } | null } | null> {
  const l = await prisma.listing.findFirst({ where: { id: listingId, deletedAt: null } })
  if (!l || l.status !== 'open') return null
  const [counts, mine] = await Promise.all([
    bidCounts([l.id]),
    prisma.bid.findFirst({ where: { listingId: l.id, bidderUserId: viewerUserId }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true } }),
  ])
  return { listing: toListingView(l, viewerUserId, counts.get(l.id) ?? 0), myBid: mine ?? null }
}
