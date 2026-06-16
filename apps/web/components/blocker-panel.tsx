'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, OctagonAlert, Plus, Check } from 'lucide-react'
import { raiseBlockerAction, resolveBlockerAction } from '@/app/contractor/actions'

export type Blocker = {
  id: string
  status: 'open' | 'resolved'
  reason: string
  raisedByRole: 'client' | 'contractor'
  resolutionNote: string | null
  resolvedByRole: 'client' | 'contractor' | null
  createdAt: string
  resolvedAt: string | null
  fromMe: boolean
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/**
 * Blockers — a stalled-work flag on a contract. Either party raises one (the contractor waiting on the client,
 * or any impediment); either party resolves it. While ANY blocker is open the billable clock is paused (the
 * billing/timer exclusion ties in later). Refreshes to canonical server state after each action.
 */
export function BlockerPanel({ contractId, initial }: { contractId: string; initial: Blocker[] }) {
  const router = useRouter()
  const [raising, setRaising] = useState(false)
  const [reason, setReason] = useState('')
  const [resolveFor, setResolveFor] = useState<{ id: string; text: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const open = initial.filter((b) => b.status === 'open')
  const resolved = initial.filter((b) => b.status === 'resolved')

  function act(fn: () => Promise<{ ok?: true; error?: string }>, after?: () => void) {
    setErr(null)
    start(async () => {
      const r = await fn()
      if ('error' in r && r.error) setErr(r.error)
      else { after?.(); router.refresh() }
    })
  }

  function submitRaise() {
    const r = reason.trim()
    if (!r) { setErr('Describe what’s blocking.'); return }
    act(() => raiseBlockerAction(contractId, r), () => { setReason(''); setRaising(false) })
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><OctagonAlert className="size-4 text-muted-foreground" /> Blockers</h2>
        {!raising && <button type="button" onClick={() => { setErr(null); setRaising(true) }} className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Plus className="size-3.5" /> Raise</button>}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">Flag stalled work — waiting on an answer, access, or an asset. While a blocker is open, billable time is paused until it clears.</p>

      {open.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
          <OctagonAlert className="size-4 shrink-0" /> Clock paused — {open.length} open blocker{open.length > 1 ? 's' : ''}.
        </div>
      )}

      {raising && (
        <div className="mb-5 space-y-2 rounded-lg border border-border bg-background p-4">
          <p className="text-sm font-medium">Raise a blocker</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="What’s blocking the work?" className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={submitRaise} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">{pending ? <Loader2 className="size-4 animate-spin" /> : <OctagonAlert className="size-4" />} Raise blocker</button>
            <button type="button" onClick={() => { setRaising(false); setReason('') }} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">Cancel</button>
          </div>
        </div>
      )}

      {open.length === 0 && resolved.length === 0 && !raising ? (
        <p className="text-sm text-muted-foreground">No blockers.</p>
      ) : (
        <ul className="space-y-3">
          {open.map((b) => (
            <li key={b.id} className="rounded-lg border border-amber-500/40 p-4">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700">Open</span>
                <span className="text-xs text-muted-foreground">{b.fromMe ? 'You' : b.raisedByRole === 'client' ? 'Client' : 'Contractor'} · {fmtDate(b.createdAt)}</span>
              </div>
              <p className="mb-2 text-sm">{b.reason}</p>
              {resolveFor?.id === b.id ? (
                <div className="space-y-2">
                  <textarea value={resolveFor.text} onChange={(e) => setResolveFor({ id: b.id, text: e.target.value })} rows={2} placeholder="How was it resolved? (optional)" className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => act(() => resolveBlockerAction(b.id, resolveFor.text.trim()), () => setResolveFor(null))} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"><Check className="size-3.5" /> Resolve</button>
                    <button type="button" onClick={() => setResolveFor(null)} className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-sm hover:bg-muted">Cancel</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setResolveFor({ id: b.id, text: '' })} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"><Check className="size-3.5" /> Resolve</button>
              )}
            </li>
          ))}
          {resolved.map((b) => (
            <li key={b.id} className="rounded-lg border border-border/60 p-4 opacity-80">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Resolved</span>
                <span className="text-xs text-muted-foreground">{b.resolvedAt ? fmtDate(b.resolvedAt) : ''}</span>
              </div>
              <p className="text-sm text-muted-foreground line-through">{b.reason}</p>
              {b.resolutionNote && <p className="mt-1 text-xs text-muted-foreground">→ {b.resolutionNote}</p>}
            </li>
          ))}
        </ul>
      )}
      {err && !raising && !resolveFor && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </section>
  )
}
