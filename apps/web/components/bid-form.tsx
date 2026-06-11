'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import { submitBidAction } from '@/app/contractor/actions'

const BID_ERRORS: Record<string, string> = {
  own_listing: "You can't bid on your own job.",
  not_open: 'This job is no longer open.',
  too_many_bids: 'This job has reached its bid limit.',
  not_found: 'Job not found.',
  vetting_required: 'Only vetted contractors can bid.',
}

const inputCls = 'h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary'

/** Submit a proposal on a listing. Pre-fills the rate type from the listing's budget type. */
export function BidForm({ listingId, defaultRateType }: { listingId: string; defaultRateType: 'hourly' | 'fixed' }) {
  const router = useRouter()
  const [rateType, setRateType] = useState<'hourly' | 'fixed'>(defaultRateType)
  const [amount, setAmount] = useState('')
  const [hours, setHours] = useState('')
  const [message, setMessage] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    setErr(null)
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) return setErr('Enter a valid amount.')
    start(async () => {
      const r = await submitBidAction(listingId, {
        rateType,
        amount: amt,
        hoursEstimate: hours ? Number(hours) : null,
        message: message.trim() || null,
      })
      if ('error' in r) setErr(BID_ERRORS[r.error] ?? r.error)
      else router.push('/contractor/bids')
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Place a bid</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Rate type</span>
          <select value={rateType} onChange={(e) => setRateType(e.target.value as 'hourly' | 'fixed')} className={inputCls}>
            <option value="hourly">Hourly</option>
            <option value="fixed">Fixed</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{rateType === 'hourly' ? 'Your rate ($/hr)' : 'Your price ($)'}</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />
        </label>
        {rateType === 'hourly' && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Est. hours (optional)</span>
            <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" placeholder="—" className={inputCls} />
          </label>
        )}
      </div>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Message (optional)</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000} placeholder="Why you're a good fit…" className={`${inputCls} h-auto resize-y py-2`} />
      </label>
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      <button onClick={submit} disabled={pending} className="mt-3 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit bid
      </button>
    </div>
  )
}
