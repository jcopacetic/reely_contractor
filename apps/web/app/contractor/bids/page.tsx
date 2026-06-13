import { apiQuery } from '@/lib/api'
import { MyBids } from '@/components/my-bids'

export const dynamic = 'force-dynamic'

type MyBid = {
  id: string; rateType: 'hourly' | 'fixed'; amount: number; hoursEstimate: number | null; status: string; createdAt: string
  listing: { id: string; title: string; status: string }
}

export default async function BidsPage() {
  const bids = await apiQuery<MyBid[]>('marketplace.myBids').catch(() => [] as MyBid[])
  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-5 font-display text-2xl font-bold tracking-tight">Your bids</h1>
        <MyBids initial={bids} />
      </main>
    </>
  )
}
