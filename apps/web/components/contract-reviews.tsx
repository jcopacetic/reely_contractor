'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Star, Eye, EyeOff, Loader2 } from 'lucide-react'
import { manageReviewAction } from '@/app/contractor/actions'
import { fmtDate } from '@/lib/datetime'
import { useViewerTz } from '@/lib/timezone'

export type Review = { id: string; kind: 'weekly' | 'final'; rating: number; body: string; authorLabel: string | null; weekOf: string | null; approvedForDisplay: boolean; createdAt: string }

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex" aria-label={`${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`size-3.5 ${i <= n ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`} />)}
    </span>
  )
}

/**
 * The reviews on one contract. The contractor (role 'contractor') can show/hide each WEEKLY review on their public
 * profile; the FINAL review is always public (no toggle). The client sees their reviews read-only.
 */
export function ContractReviews({ reviews, role }: { reviews: Review[]; role: 'client' | 'contractor' }) {
  const router = useRouter()
  const tz = useViewerTz()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)

  const toggle = (id: string) => {
    setBusy(id)
    start(async () => {
      await manageReviewAction(id)
      setBusy(null)
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Star className="size-4" /> Reviews
      </h2>
      {reviews.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {role === 'contractor' ? 'No reviews yet — your client can review your work weekly and at close.' : 'No reviews yet.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-lg border border-border/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Stars n={r.rating} />
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.kind === 'final' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{r.kind === 'final' ? 'Final' : 'Weekly'}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-sm">{r.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{r.authorLabel ?? 'Client'} · {fmtDate(r.createdAt, tz)}</p>
                </div>
                {role === 'contractor' && (
                  <div className="shrink-0">
                    {r.kind === 'final' ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">Always public</span>
                    ) : (
                      <button onClick={() => toggle(r.id)} disabled={pending} className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition disabled:opacity-50 ${r.approvedForDisplay ? 'border-emerald-500/40 text-emerald-700' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                        {busy === r.id ? <Loader2 className="size-3.5 animate-spin" /> : r.approvedForDisplay ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                        {r.approvedForDisplay ? 'Shown' : 'Hidden'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {role === 'contractor' && reviews.some((r) => r.kind === 'weekly') && (
        <p className="mt-3 text-[11px] text-muted-foreground">Weekly reviews are private until you show them. Your final review is always public.</p>
      )}
    </section>
  )
}
