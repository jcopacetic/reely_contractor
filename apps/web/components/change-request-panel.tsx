'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, GitPullRequestArrow, Plus, X, Check, Pencil } from 'lucide-react'
import { proposeChangeRequestAction, editChangeRequestAction, approveChangeRequestAction, withdrawChangeRequestAction, type ChangeRequestInput } from '@/app/contractor/actions'

type Kind = 'scope' | 'rate' | 'timeline' | 'other'
export type ChangeRequest = {
  id: string
  kind: Kind
  title: string
  detail: string
  proposedRateType: 'hourly' | 'fixed' | null
  proposedRateAmount: number | null
  status: 'proposed' | 'agreed' | 'withdrawn'
  clientApproved: boolean
  contractorApproved: boolean
  lastEditedByRole: 'client' | 'contractor'
  myRole: 'client' | 'contractor'
  appliedAt: string | null
  createdAt: string
  agreedAt: string | null
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const KIND_LABEL: Record<Kind, string> = { scope: 'Scope', rate: 'Rate', timeline: 'Timeline', other: 'Other' }
const rateStr = (c: ChangeRequest) => (c.proposedRateAmount != null ? `${usd(c.proposedRateAmount)}${c.proposedRateType === 'hourly' ? '/hr' : ' fixed'}` : '')

type Draft = { editingId: string | null; kind: Kind; title: string; detail: string; rateType: 'hourly' | 'fixed'; rateAmount: string }
const EMPTY: Draft = { editingId: null, kind: 'scope', title: '', detail: '', rateType: 'hourly', rateAmount: '' }

/**
 * Change-requests — a two-party-agreed mid-flight amendment (scope / rate / timeline / other). Same counter-edit
 * game as a sprint: an edit by either side resets the other's approval; both approve → agreed. A rate change
 * records the proposed new rate but is enacted (applied to billing) in a later, deliberate step.
 */
export function ChangeRequestPanel({ contractId, initial }: { contractId: string; initial: ChangeRequest[] }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function buildInput(d: Draft): ChangeRequestInput {
    return { kind: d.kind, title: d.title.trim(), detail: d.detail.trim(), ...(d.kind === 'rate' ? { proposedRateType: d.rateType, proposedRateAmount: Number(d.rateAmount) || 0 } : {}) }
  }

  function submit() {
    if (!draft) return
    setErr(null)
    if (!draft.title.trim() || !draft.detail.trim()) { setErr('Add a title and detail.'); return }
    if (draft.kind === 'rate' && !(Number(draft.rateAmount) > 0)) { setErr('Set the proposed rate.'); return }
    const input = buildInput(draft)
    start(async () => {
      const r = draft.editingId ? await editChangeRequestAction(draft.editingId, input) : await proposeChangeRequestAction(contractId, input)
      if ('error' in r && r.error) { setErr(r.error); return }
      setDraft(null); router.refresh()
    })
  }

  function act(fn: () => Promise<{ ok?: true; error?: string }>) {
    setErr(null)
    start(async () => {
      const r = await fn()
      if ('error' in r && r.error) setErr(r.error)
      else router.refresh()
    })
  }

  const visible = initial.filter((c) => c.status !== 'withdrawn')

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><GitPullRequestArrow className="size-4 text-muted-foreground" /> Change requests</h2>
        {!draft && <button type="button" onClick={() => { setErr(null); setDraft(EMPTY) }} className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Plus className="size-3.5" /> Propose</button>}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">A mid-flight amendment both sides agree to — a scope shift, a rate change, a new deadline. Counter-edit until you both approve.</p>

      {draft && (
        <div className="mb-5 space-y-3 rounded-lg border border-border bg-background p-4">
          <p className="text-sm font-medium">{draft.editingId ? 'Counter-proposal' : 'Propose a change'}</p>
          <div className="flex flex-wrap gap-1.5">
            {(['scope', 'rate', 'timeline', 'other'] as Kind[]).map((k) => (
              <button key={k} type="button" onClick={() => setDraft({ ...draft, kind: k })} className={`rounded-full px-3 py-1 text-xs font-medium ${draft.kind === k ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-muted'}`}>{KIND_LABEL[k]}</button>
            ))}
          </div>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Short title…" className="h-9 w-full rounded-md border border-border bg-card px-2.5 text-sm outline-none focus:border-primary" />
          <textarea value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} rows={3} placeholder="What changes, and why?" className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
          {draft.kind === 'rate' && (
            <div className="flex items-center gap-2 text-sm">
              <label className="text-muted-foreground">Proposed rate</label>
              <select value={draft.rateType} onChange={(e) => setDraft({ ...draft, rateType: e.target.value as 'hourly' | 'fixed' })} className="h-9 rounded-md border border-border bg-card px-2 text-sm">
                <option value="hourly">Hourly</option>
                <option value="fixed">Fixed</option>
              </select>
              <span className="text-muted-foreground">$</span>
              <input type="number" min={0} step="0.01" value={draft.rateAmount} onChange={(e) => setDraft({ ...draft, rateAmount: e.target.value })} className="h-9 w-28 rounded-md border border-border bg-card px-2 text-sm outline-none focus:border-primary" />
              {draft.rateType === 'hourly' && <span className="text-muted-foreground">/hr</span>}
            </div>
          )}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={submit} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">{pending ? <Loader2 className="size-4 animate-spin" /> : null} {draft.editingId ? 'Save & re-propose' : 'Propose'}</button>
            <button type="button" onClick={() => setDraft(null)} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">Cancel</button>
          </div>
        </div>
      )}

      {visible.length === 0 && !draft ? (
        <p className="text-sm text-muted-foreground">No change requests.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((c) => {
            const iApproved = c.myRole === 'contractor' ? c.contractorApproved : c.clientApproved
            const otherRole = c.myRole === 'contractor' ? 'client' : 'contractor'
            const agreed = c.status === 'agreed'
            return (
              <li key={c.id} className="rounded-lg border border-border p-4">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{KIND_LABEL[c.kind]}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${agreed ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'}`}>{agreed ? 'Agreed' : 'Proposed'}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{fmtDate(c.createdAt)}</span>
                </div>
                <p className="text-sm font-medium">{c.title}</p>
                <p className="mb-2 whitespace-pre-wrap text-sm text-muted-foreground">{c.detail}</p>
                {c.kind === 'rate' && c.proposedRateAmount != null && <p className="mb-2 text-sm">Proposed rate: <span className="font-semibold">{rateStr(c)}</span></p>}
                {agreed ? (
                  <p className="text-xs text-emerald-700">
                    Agreed{c.agreedAt ? ` · ${fmtDate(c.agreedAt)}` : ''}
                    {c.kind === 'rate' && (c.appliedAt ? ` · enacted ${fmtDate(c.appliedAt)}` : ' · pending enactment')}.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {iApproved ? (
                      <span className="text-xs text-muted-foreground">You approved — waiting on the {otherRole}.</span>
                    ) : (
                      <button type="button" onClick={() => act(() => approveChangeRequestAction(c.id))} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"><Check className="size-3.5" /> Approve</button>
                    )}
                    <button type="button" onClick={() => { setErr(null); setDraft({ editingId: c.id, kind: c.kind, title: c.title, detail: c.detail, rateType: c.proposedRateType ?? 'hourly', rateAmount: c.proposedRateAmount != null ? String(c.proposedRateAmount) : '' }) }} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm font-medium hover:bg-muted"><Pencil className="size-3.5" /> {iApproved ? 'Edit' : 'Counter'}</button>
                    <button type="button" onClick={() => act(() => withdrawChangeRequestAction(c.id))} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"><X className="size-3.5" /> Withdraw</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {err && !draft && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </section>
  )
}
