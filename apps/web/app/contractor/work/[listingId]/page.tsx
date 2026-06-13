import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiQuery } from '@/lib/api'
import { BidForm } from '@/components/bid-form'
import { ListingBids } from '@/components/listing-bids'
import { budgetLabel } from '@/components/work-browse'

export const dynamic = 'force-dynamic'

type Listing = {
  id: string; ownerUserId: string; boardPartRef: string | null; title: string; description: string
  categoryIds: string[]; budgetType: 'hourly' | 'fixed'; budgetAmount: number | null; status: string; createdAt: string; bidCount: number; isOwner: boolean
}
type Bid = { id: string; bidder: { userId: string; displayName: string; avatarUrl: string | null; publicSlug: string | null } | null; rateType: 'hourly' | 'fixed'; amount: number; hoursEstimate: number | null; message: string | null; status: string }
type Category = { id: string; name: string; slug: string }

export default async function ListingDetailPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params
  const [listing, categories] = await Promise.all([
    apiQuery<Listing | null>('marketplace.getListing', { listingId }).catch(() => null),
    apiQuery<Category[]>('profile.listCategories').catch(() => [] as Category[]),
  ])
  if (!listing) notFound()
  const catName = new Map(categories.map((c) => [c.id, c.name]))

  // Owner → manage bids; otherwise → the viewer's bid state (jobFeed.get is open-only).
  const ownerBids = listing.isOwner
    ? await apiQuery<{ bids: Bid[] } | { error: string }>('marketplace.getBidsForListing', { listingId }).catch(() => ({ bids: [] as Bid[] }))
    : null
  const feed = !listing.isOwner ? await apiQuery<{ myBid: { id: string; status: string } | null } | null>('jobFeed.get', { listingId }).catch(() => null) : null
  const myBid = feed?.myBid ?? null

  return (
    <>
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <Link href="/contractor/work" className="text-sm text-muted-foreground hover:text-foreground">← All jobs</Link>

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-xl font-bold tracking-tight">{listing.title}</h1>
            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{budgetLabel(listing.budgetType, listing.budgetAmount)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="capitalize">{listing.status}</span>
            {listing.boardPartRef && <span className="rounded-full bg-muted px-2 py-0.5">via Board</span>}
            <span>· {listing.bidCount} bid{listing.bidCount === 1 ? '' : 's'}</span>
          </div>
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{listing.description}</p>
          {listing.categoryIds.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {listing.categoryIds.map((id) => catName.get(id) && <span key={id} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">{catName.get(id)}</span>)}
            </div>
          )}
        </section>

        {listing.isOwner ? (
          <ListingBids bids={ownerBids && 'bids' in ownerBids ? ownerBids.bids : []} listingStatus={listing.status} listingId={listing.id} />
        ) : listing.status !== 'open' ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">This job is no longer accepting bids.</p>
        ) : myBid ? (
          <div className="rounded-xl border border-border bg-card p-5 text-sm">
            You've bid on this job — status: <span className="font-semibold capitalize">{myBid.status}</span>. Track it on <Link href="/contractor/bids" className="text-primary hover:underline">your bids</Link>.
          </div>
        ) : (
          <BidForm listingId={listing.id} defaultRateType={listing.budgetType} />
        )}
      </main>
    </>
  )
}
