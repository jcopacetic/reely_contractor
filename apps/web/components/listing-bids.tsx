'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, X, Reply } from 'lucide-react'
import { acceptBidAction, counterBidAction, denyBidAction, closeListingAction } from '@/app/contractor/actions'
import { budgetLabel } from '@/components/work-browse'

type Bid = {
  id: string
  bidder: { userId: string; displayName: string; avatarUrl: string | null; publicSlug: string | null } | null
  rateType: 'hourly' | 'fixed'
  amount: number
  hoursEstimate: number | null
  message: string | null
  status: string
}

const STATUS_STYLE: Record<string, string> = {
  submitted: 'bg-muted text-muted-foreground',
  countered: 'bg-amber-500/15 text-amber-600',
  accepted: 'bg-emerald-500/15 text-emerald-700',
  denied: 'bg-destructive/10 text-destructive',
  withdrawn: 'bg-muted text-muted-foreground line-through',
}

/** The listing owner's bid-management panel (accept / counter / deny), shown on the owner's own listing. */
export function ListingBids({ bids, listingStatus, listingId }: { bids: Bid[]; listingStatus: string; listingId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function act(fn: () => Promise<unknown>, key: string) {
    setBusy(key)
    start(async () => {
      await fn()
      setBusy(null)
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bids ({bids.length})</h2>
        {listingStatus === 'open' && (
          <button onClick={() => act(() => closeListingAction(listingId), 'close')} disabled={pending} className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50">
            Close listing
          </button>
        )}
      </div>
      {bids.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No bids yet.</p>
      ) : (
        <ul className="space-y-3">
          {bids.map((b) => {
            const active = b.status === 'submitted' || b.status === 'countered'
            return (
              <li key={b.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {b.bidder?.publicSlug ? (
                      <a href={`/contractor/u/${b.bidder.userId}`} className="text-sm font-semibold hover:text-primary">{b.bidder.displayName}</a>
                    ) : (
                      <span className="text-sm font-semibold">{b.bidder?.displayName ?? 'Contractor'}</span>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {budgetLabel(b.rateType, b.amount)}
                      {b.hoursEstimate != null && ` · ~${b.hoursEstimate}h`}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[b.status] ?? 'bg-muted'}`}>{b.status}</span>
                </div>
                {b.message && <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/90">{b.message}</p>}
                {active && listingStatus === 'open' && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <button onClick={() => act(() => acceptBidAction(b.id), `a-${b.id}`)} disabled={pending} className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                      {busy === `a-${b.id}` ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Accept
                    </button>
                    {b.status === 'submitted' && (
                      <button onClick={() => act(() => counterBidAction(b.id), `c-${b.id}`)} disabled={pending} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-muted disabled:opacity-50">
                        <Reply className="size-3" /> Counter
                      </button>
                    )}
                    <button onClick={() => act(() => denyBidAction(b.id), `d-${b.id}`)} disabled={pending} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50">
                      <X className="size-3" /> Deny
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
