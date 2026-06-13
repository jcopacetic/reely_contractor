'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Receipt, ShieldAlert } from 'lucide-react'
import { raiseCycleDisputeAction } from '@/app/contractor/actions'

export type Cycle = {
  id: string
  periodStart: string
  periodEnd: string
  status: 'open' | 'dispute_window' | 'charged' | 'disputed' | 'voided'
  totalSeconds: number
  totalAmount: number
  takeRateAmount: number
  disputeWindowEndsAt: string
  chargedAt: string | null
  chargeStatus: string | null
  payoutStatus: string | null
  openDispute: boolean
}

const STATUS: Record<Cycle['status'], { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-muted text-muted-foreground' },
  dispute_window: { label: 'Pending charge', cls: 'bg-amber-500/15 text-amber-600' },
  charged: { label: 'Charged', cls: 'bg-emerald-500/15 text-emerald-700' },
  disputed: { label: 'Disputed', cls: 'bg-destructive/10 text-destructive' },
  voided: { label: 'Voided', cls: 'bg-muted text-muted-foreground line-through' },
}

const hm = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function countdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'charging soon'
  const days = Math.ceil(ms / 86_400_000)
  return `charges in ${days}d`
}

/**
 * The contract's weekly billing — one row per cycle (period, hours, amount, status). A participant can dispute a
 * cycle still in its window; that blocks the charge until an admin resolves it. The contractor sees their net
 * payout (gross − platform fee); both see the gross. Reads only; charges are platform-initiated after the window.
 */
export function BillingPanel({ cycles, role }: { cycles: Cycle[]; role: 'client' | 'contractor' }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const dispute = (id: string) => {
    if (!reason.trim()) return
    setErr(null)
    start(async () => {
      const r = await raiseCycleDisputeAction(id, reason.trim())
      if (r.error) setErr(r.error)
      else {
        setOpenFor(null)
        setReason('')
        router.refresh()
      }
    })
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Receipt className="size-4" /> Weekly billing
      </h2>
      {cycles.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No billing cycles yet. Approved time is swept into a weekly cycle every Sunday.
        </p>
      ) : (
        <ul className="space-y-2">
          {cycles.map((c) => {
            const net = Math.round((c.totalAmount - c.takeRateAmount) * 100) / 100
            const s = STATUS[c.status]
            const canDispute = (c.status === 'dispute_window' || c.status === 'open') && !c.openDispute
            return (
              <li key={c.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {day(c.periodStart)} – {day(c.periodEnd)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {hm(c.totalSeconds)} · {role === 'contractor' ? `you receive ${usd(net)}` : `billed ${usd(c.totalAmount)}`}
                      {c.status === 'dispute_window' && ` · ${countdown(c.disputeWindowEndsAt)}`}
                      {c.status === 'charged' && c.chargedAt && ` · ${new Date(c.chargedAt).toLocaleDateString()}`}
                      {c.status === 'charged' && c.payoutStatus && ` · payout ${c.payoutStatus}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold">{usd(c.totalAmount)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
                  </div>
                </div>
                {c.openDispute && (
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-destructive">
                    <ShieldAlert className="size-3.5" /> Disputed — an admin is reviewing this cycle.
                  </p>
                )}
                {canDispute &&
                  (openFor === c.id ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && dispute(c.id)}
                        placeholder="What's wrong with this cycle?"
                        autoFocus
                        className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                      />
                      <button onClick={() => dispute(c.id)} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-60">
                        {pending ? <Loader2 className="size-4 animate-spin" /> : null} Submit
                      </button>
                      <button onClick={() => { setOpenFor(null); setReason('') }} className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-sm hover:bg-muted">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => { setOpenFor(c.id); setErr(null) }} className="mt-2 inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-muted">
                      <ShieldAlert className="size-3.5" /> Dispute this cycle
                    </button>
                  ))}
              </li>
            )
          })}
        </ul>
      )}
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </section>
  )
}
