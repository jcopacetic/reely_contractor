'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { withdrawBidAction } from '@/app/contractor/actions'
import { budgetLabel } from '@/components/work-browse'

type MyBid = {
  id: string
  rateType: 'hourly' | 'fixed'
  amount: number
  hoursEstimate: number | null
  status: string
  createdAt: string
  listing: { id: string; title: string; status: string }
}

const STATUS_STYLE: Record<string, string> = {
  submitted: 'bg-muted text-muted-foreground',
  countered: 'bg-amber-500/15 text-amber-600',
  accepted: 'bg-emerald-500/15 text-emerald-700',
  denied: 'bg-destructive/10 text-destructive',
  withdrawn: 'bg-muted text-muted-foreground line-through',
}

export function MyBids({ initial }: { initial: MyBid[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const withdraw = (id: string) => start(async () => { await withdrawBidAction(id); router.refresh() })

  if (initial.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
        No bids yet. <Link href="/contractor/work" className="text-primary hover:underline">Find work</Link> and place your first.
      </div>
    )

  return (
    <ul className="space-y-3">
      {initial.map((b) => {
        const active = b.status === 'submitted' || b.status === 'countered'
        return (
          <li key={b.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/contractor/work/${b.listing.id}`} className="min-w-0">
                <p className="truncate font-display text-sm font-semibold hover:text-primary">{b.listing.title}</p>
                <p className="text-xs text-muted-foreground">
                  {budgetLabel(b.rateType, b.amount)}
                  {b.hoursEstimate != null && ` · ~${b.hoursEstimate}h`}
                </p>
              </Link>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[b.status] ?? 'bg-muted'}`}>{b.status}</span>
            </div>
            {active && (
              <button onClick={() => withdraw(b.id)} disabled={pending} className="mt-2 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50">
                {pending ? <Loader2 className="inline size-3 animate-spin" /> : null} Withdraw
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
