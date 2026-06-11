'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Clock } from 'lucide-react'
import { createContractItemAction, updateContractStatusAction } from '@/app/contractor/actions'
import { budgetLabel } from '@/components/work-browse'

type Kind = 'milestone' | 'scope_add' | 'deliverable' | 'note'
type Item = { id: string; kind: Kind; title: string; description: string | null; amount: number | null; status: string; order: number }
type Contract = {
  id: string; title: string; listingTitle: string | null; boardRef: string | null
  clientUserId: string; contractorUserId: string; rateType: 'hourly' | 'fixed'; rateAmount: number
  status: string; role: 'client' | 'contractor'; startedAt: string; endedAt: string | null; items: Item[]
}

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-700',
  paused: 'bg-amber-500/15 text-amber-600',
  completed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/10 text-destructive',
}
const NEXT: Record<string, Array<{ to: 'active' | 'paused' | 'completed' | 'cancelled'; label: string }>> = {
  active: [{ to: 'paused', label: 'Pause' }, { to: 'completed', label: 'Complete' }, { to: 'cancelled', label: 'Cancel' }],
  paused: [{ to: 'active', label: 'Resume' }, { to: 'completed', label: 'Complete' }, { to: 'cancelled', label: 'Cancel' }],
  completed: [],
  cancelled: [],
}
const KIND_LABEL: Record<Kind, string> = { milestone: 'Milestone', scope_add: 'Scope add', deliverable: 'Deliverable', note: 'Note' }
const shortId = (s: string) => `…${s.slice(-5)}`
const inputCls = 'h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary'

export function ContractDetail({ contract }: { contract: Contract }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [kind, setKind] = useState<Kind>('milestone')
  const [title, setTitle] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const closed = contract.status === 'completed' || contract.status === 'cancelled'
  const transitions = NEXT[contract.status] ?? []

  function addItem() {
    setErr(null)
    if (!title.trim()) return
    start(async () => {
      const r = await createContractItemAction(contract.id, { kind, title: title.trim() })
      if (r.error) setErr(r.error)
      else { setTitle(''); router.refresh() }
    })
  }
  const setStatus = (to: 'active' | 'paused' | 'completed' | 'cancelled') => start(async () => { await updateContractStatusAction(contract.id, to); router.refresh() })

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-xl font-bold tracking-tight">{contract.title}</h1>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[contract.status] ?? 'bg-muted'}`}>{contract.status}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{budgetLabel(contract.rateType, contract.rateAmount)}</span>
          <span>{contract.role === 'contractor' ? `Client ${shortId(contract.clientUserId)}` : `Contractor ${shortId(contract.contractorUserId)}`}</span>
          {contract.boardRef && <span className="rounded-full bg-muted px-2 py-0.5">via Board</span>}
          <span>· started {new Date(contract.startedAt).toLocaleDateString()}</span>
        </div>
        {transitions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {transitions.map((a) => (
              <button key={a.to} onClick={() => setStatus(a.to)} disabled={pending} className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs hover:bg-muted disabled:opacity-50">{a.label}</button>
            ))}
          </div>
        )}
      </section>

      {/* Items — the living container */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Scope &amp; milestones</h2>
        {contract.items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Nothing added yet.</p>
        ) : (
          <ul className="space-y-2">
            {contract.items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{it.title}</p>
                  {it.description && <p className="text-xs text-muted-foreground">{it.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {it.amount != null && <span className="text-xs font-medium">${it.amount.toLocaleString('en-US')}</span>}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{KIND_LABEL[it.kind]}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!closed && (
          <div className="mt-3 flex items-center gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={`${inputCls} w-32`}>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
            <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addItem()} placeholder="Add a milestone / deliverable…" className={`${inputCls} flex-1`} />
            <button onClick={addItem} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
            </button>
          </div>
        )}
        {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      </section>

      <section className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
        <Clock className="mx-auto mb-1 size-4 opacity-40" />
        Weekly billing &amp; payouts — coming soon. Approved time is what bills.
      </section>
    </div>
  )
}
