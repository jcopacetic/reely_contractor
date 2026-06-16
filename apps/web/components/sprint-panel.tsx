'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Rocket, Plus, X, Check, Pencil, Trash2, Send, ThumbsUp, Undo2 } from 'lucide-react'
import { proposeSprintAction, editSprintAction, approveSprintAction, cancelSprintAction, submitSprintAction, acceptSprintAction, requestSprintChangesAction } from '@/app/contractor/actions'

export type SprintItem = { title: string; effortPoints: number }
export type Sprint = {
  id: string
  status: 'proposed' | 'agreed' | 'review' | 'completed' | 'cancelled'
  ttdDays: number
  items: SprintItem[]
  expectedHours: number
  expectedBudget: number | null
  clientApproved: boolean
  contractorApproved: boolean
  lastEditedByRole: 'client' | 'contractor'
  myRole: 'client' | 'contractor'
  submittedAt: string | null
  reviewDueAt: string | null
  acceptedAt: string | null
  autoAccepted: boolean
  submissionNote: string | null
  changeRequestNote: string | null
  createdAt: string
  agreedAt: string | null
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type Composer = { editingId: string | null; items: SprintItem[]; ttd: number }

/**
 * Sprint negotiation — a two-party game: propose a collection of tasks (effort points ≈ hours) + a delivery
 * window; the budget recalculates live (Σ points × rate); either party can counter-edit (which resets the
 * other's approval); both approve → agreed. After each action we refresh to the canonical server state.
 */
export function SprintPanel({ contractId, rateType, rateAmount, initial }: { contractId: string; rateType: 'hourly' | 'fixed'; rateAmount: number; initial: Sprint[] }) {
  const router = useRouter()
  const [composer, setComposer] = useState<Composer | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const draftHours = composer ? composer.items.reduce((n, i) => n + (Number(i.effortPoints) || 0), 0) : 0
  const draftBudget = rateType === 'hourly' ? draftHours * rateAmount : null

  function patchItem(idx: number, patch: Partial<SprintItem>) {
    if (!composer) return
    setComposer({ ...composer, items: composer.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) })
  }
  function addItem() { if (composer) setComposer({ ...composer, items: [...composer.items, { title: '', effortPoints: 1 }] }) }
  function removeItem(idx: number) { if (composer) setComposer({ ...composer, items: composer.items.filter((_, i) => i !== idx) }) }

  function submit() {
    if (!composer) return
    setErr(null)
    const items = composer.items.map((i) => ({ title: i.title.trim(), effortPoints: Math.max(0, Math.round(Number(i.effortPoints) || 0)) })).filter((i) => i.title)
    if (items.length === 0) { setErr('Add at least one task.'); return }
    start(async () => {
      const r = composer.editingId ? await editSprintAction(composer.editingId, items, composer.ttd) : await proposeSprintAction(contractId, items, composer.ttd)
      if ('error' in r && r.error) { setErr(r.error); return }
      setComposer(null)
      router.refresh()
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

  const visible = initial.filter((s) => s.status !== 'cancelled')

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Rocket className="size-4 text-muted-foreground" /> Sprints</h2>
        {!composer && <button type="button" onClick={() => { setErr(null); setComposer({ editingId: null, items: [{ title: '', effortPoints: 1 }], ttd: 7 }) }} className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Plus className="size-3.5" /> Propose</button>}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">A scoped batch of tasks + a delivery window, agreed by both sides. Effort points (≈ hours) set the expected budget — no guesswork.</p>

      {composer && (
        <div className="mb-5 space-y-3 rounded-lg border border-border bg-background p-4">
          <p className="text-sm font-medium">{composer.editingId ? 'Counter-proposal' : 'Propose a sprint'}</p>
          <div className="space-y-2">
            {composer.items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input value={it.title} onChange={(e) => patchItem(idx, { title: e.target.value })} placeholder="Task…" className="h-9 flex-1 rounded-md border border-border bg-card px-2 text-sm outline-none focus:border-primary" />
                <input type="number" min={0} max={1000} value={it.effortPoints} onChange={(e) => patchItem(idx, { effortPoints: Number(e.target.value) })} title="Effort points ≈ hours" className="h-9 w-16 rounded-md border border-border bg-card px-2 text-sm outline-none focus:border-primary" />
                <button type="button" onClick={() => removeItem(idx)} className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted"><Trash2 className="size-4" /></button>
              </div>
            ))}
            <button type="button" onClick={addItem} className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Plus className="size-3.5" /> Add task</button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-muted-foreground">Deliver within</label>
            <input type="number" min={1} max={365} value={composer.ttd} onChange={(e) => setComposer({ ...composer, ttd: Number(e.target.value) })} className="h-9 w-16 rounded-md border border-border bg-card px-2 text-sm" />
            <span className="text-muted-foreground">days</span>
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <span className="font-medium">{draftHours} effort pts</span> ≈ {draftHours} hrs
            {draftBudget != null && <> · expected budget <span className="font-semibold">{usd(draftBudget)}</span> at ${rateAmount}/hr</>}
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={submit} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} {composer.editingId ? 'Save & re-propose' : 'Propose'}
            </button>
            <button type="button" onClick={() => setComposer(null)} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">Cancel</button>
          </div>
        </div>
      )}

      {visible.length === 0 && !composer ? (
        <p className="text-sm text-muted-foreground">No sprints yet.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((s) => (
            <SprintCard
              key={s.id}
              s={s}
              pending={pending}
              onEdit={(sp) => { setErr(null); setComposer({ editingId: sp.id, items: sp.items.length ? sp.items : [{ title: '', effortPoints: 1 }], ttd: sp.ttdDays }) }}
              onApprove={(id) => act(() => approveSprintAction(id))}
              onCancel={(id) => act(() => cancelSprintAction(id))}
              onSubmit={(id, note) => act(() => submitSprintAction(id, note))}
              onAccept={(id) => act(() => acceptSprintAction(id))}
              onRequestChanges={(id, note) => act(() => requestSprintChangesAction(id, note))}
            />
          ))}
        </ul>
      )}
      {err && !composer && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </section>
  )
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  proposed: { label: 'Proposed', cls: 'bg-amber-500/15 text-amber-700' },
  agreed: { label: 'Agreed', cls: 'bg-sky-500/15 text-sky-700' },
  review: { label: 'In review', cls: 'bg-violet-500/15 text-violet-700' },
  completed: { label: 'Accepted', cls: 'bg-emerald-500/15 text-emerald-700' },
}

function SprintCard({ s, pending, onEdit, onApprove, onCancel, onSubmit, onAccept, onRequestChanges }: {
  s: Sprint; pending: boolean
  onEdit: (s: Sprint) => void; onApprove: (id: string) => void; onCancel: (id: string) => void
  onSubmit: (id: string, note: string) => void; onAccept: (id: string) => void; onRequestChanges: (id: string, note: string) => void
}) {
  const [noteMode, setNoteMode] = useState<'submit' | 'changes' | null>(null)
  const [note, setNote] = useState('')
  const iApproved = s.myRole === 'contractor' ? s.contractorApproved : s.clientApproved
  const otherRole = s.myRole === 'contractor' ? 'client' : 'contractor'
  const st = STATUS_STYLE[s.status] ?? STATUS_STYLE.proposed!

  function fireNote(kind: 'submit' | 'changes') {
    const n = note.trim()
    if (kind === 'submit') onSubmit(s.id, n)
    else onRequestChanges(s.id, n)
    setNote(''); setNoteMode(null)
  }

  return (
    <li className="rounded-lg border border-border p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
        <span className="text-xs text-muted-foreground">{s.ttdDays}d · {s.expectedHours} pts{s.expectedBudget != null ? ` · ${usd(s.expectedBudget)}` : ''}</span>
      </div>
      <ul className="mb-2 space-y-0.5">
        {s.items.map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-foreground">{it.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{it.effortPoints} pt</span>
          </li>
        ))}
      </ul>

      {s.changeRequestNote && (s.status === 'agreed') && (
        <p className="mb-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800">Changes requested: {s.changeRequestNote}</p>
      )}

      {s.status === 'proposed' && (
        <div className="flex flex-wrap items-center gap-2">
          {iApproved ? (
            <span className="text-xs text-muted-foreground">You approved — waiting on the {otherRole}.</span>
          ) : (
            <button type="button" onClick={() => onApprove(s.id)} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"><Check className="size-3.5" /> Approve</button>
          )}
          <button type="button" onClick={() => onEdit(s)} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm font-medium hover:bg-muted"><Pencil className="size-3.5" /> {iApproved ? 'Edit' : 'Counter'}</button>
          <button type="button" onClick={() => onCancel(s.id)} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"><X className="size-3.5" /> Cancel</button>
        </div>
      )}

      {s.status === 'agreed' && (
        <div className="space-y-2">
          <p className="text-xs text-sky-700">Both parties agreed{s.agreedAt ? ` · ${fmtDate(s.agreedAt)}` : ''}.</p>
          {s.myRole === 'contractor' ? (
            noteMode === 'submit' ? (
              <div className="space-y-2">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What did you deliver / how to verify? (optional)" className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => fireNote('submit')} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"><Send className="size-3.5" /> Submit for review</button>
                  <button type="button" onClick={() => { setNoteMode(null); setNote('') }} className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setNoteMode('submit')} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"><Send className="size-3.5" /> Submit for review</button>
            )
          ) : (
            <p className="text-xs text-muted-foreground">Waiting for the contractor to deliver.</p>
          )}
        </div>
      )}

      {s.status === 'review' && (
        <div className="space-y-2">
          <p className="text-xs text-violet-700">Delivered{s.submittedAt ? ` · ${fmtDate(s.submittedAt)}` : ''}{s.reviewDueAt ? ` · auto-accepts ${fmtDate(s.reviewDueAt)}` : ''}.</p>
          {s.submissionNote && <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-foreground">{s.submissionNote}</p>}
          {s.myRole === 'client' ? (
            noteMode === 'changes' ? (
              <div className="space-y-2">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What needs to change?" className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => fireNote('changes')} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm font-medium hover:bg-muted"><Undo2 className="size-3.5" /> Send back</button>
                  <button type="button" onClick={() => { setNoteMode(null); setNote('') }} className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => onAccept(s.id)} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"><ThumbsUp className="size-3.5" /> Accept</button>
                <button type="button" onClick={() => setNoteMode('changes')} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm font-medium hover:bg-muted"><Undo2 className="size-3.5" /> Request changes</button>
              </div>
            )
          ) : (
            <p className="text-xs text-muted-foreground">Awaiting the client&apos;s acceptance.</p>
          )}
        </div>
      )}

      {s.status === 'completed' && (
        <p className="text-xs text-emerald-700">Accepted{s.acceptedAt ? ` · ${fmtDate(s.acceptedAt)}` : ''}{s.autoAccepted ? ' (auto)' : ''}.</p>
      )}
    </li>
  )
}
