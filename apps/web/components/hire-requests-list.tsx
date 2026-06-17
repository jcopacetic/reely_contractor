'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Inbox, Mail, Check, Undo2, Loader2 } from 'lucide-react'
import { setHireRequestStatusAction } from '@/app/contractor/actions'

export type HireRequest = {
  id: string
  fromName: string
  fromEmail: string
  message: string
  projectType: string | null
  budget: string | null
  status: string
  createdAt: string
}

function ago(s: string): string {
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (d < 1) return 'today'
  if (d === 1) return 'yesterday'
  return d < 7 ? `${d}d ago` : new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** The contractor's inbound hire leads — reply by email, mark handled (or reopen). New leads are highlighted. */
export function HireRequestsList({ initial }: { initial: HireRequest[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)

  function setStatus(id: string, status: 'new' | 'handled') {
    setBusy(id)
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)))
    start(async () => { await setHireRequestStatusAction(id, status); setBusy(null); router.refresh() })
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No hire requests yet. When someone reaches out through your public profile, their message lands here.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {items.map((r) => {
        const handled = r.status === 'handled'
        return (
          <li key={r.id} className={`rounded-xl border p-4 transition ${handled ? 'border-border bg-card opacity-70' : 'border-primary/30 bg-primary/[0.04]'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {r.fromName}
                  {!handled && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">New</span>}
                </p>
                <a href={`mailto:${r.fromEmail}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><Mail className="size-3" /> {r.fromEmail}</a>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{ago(r.createdAt)}</span>
            </div>
            {(r.projectType || r.budget) && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {r.projectType && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{r.projectType}</span>}
                {r.budget && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{r.budget}</span>}
              </div>
            )}
            <p className="mt-2 whitespace-pre-line text-sm text-foreground/90">{r.message}</p>
            <div className="mt-3 flex items-center gap-2">
              <a href={`mailto:${r.fromEmail}?subject=${encodeURIComponent('Re: your project')}`} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"><Mail className="size-3.5" /> Reply</a>
              {handled ? (
                <button type="button" onClick={() => setStatus(r.id, 'new')} disabled={busy === r.id} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted disabled:opacity-60">
                  {busy === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />} Reopen
                </button>
              ) : (
                <button type="button" onClick={() => setStatus(r.id, 'handled')} disabled={busy === r.id} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-60">
                  {busy === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Mark handled
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function HireRequestsHeader({ count }: { count: number }) {
  return (
    <h1 className="mb-4 flex items-center gap-2 font-display text-xl font-bold">
      <Inbox className="size-5 text-muted-foreground" /> Hire requests
      {count > 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{count} new</span>}
    </h1>
  )
}
