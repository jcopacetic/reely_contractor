'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Compass, Check, Pencil, Flag } from 'lucide-react'
import { saveCharterAction, acknowledgeCharterAction, closeOutCharterAction } from '@/app/contractor/actions'

export type Charter = {
  goals: string | null
  workingAgreement: string | null
  successCriteria: string | null
  clientAcknowledged: boolean
  contractorAcknowledged: boolean
  lastEditedByRole: 'client' | 'contractor' | null
  myRole: 'client' | 'contractor'
  status: 'draft' | 'active' | 'closed'
  kickedOffAt: string | null
  closeOutNote: string | null
  closedAt: string | null
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const SECTIONS = [
  { key: 'goals', label: 'Goals', hint: 'What are we setting out to achieve?' },
  { key: 'workingAgreement', label: 'Working agreement', hint: 'Cadence, communication, hours, how we work together.' },
  { key: 'successCriteria', label: 'Success criteria', hint: 'What does a great outcome look like at the end?' },
] as const

const STATUS = {
  draft: { label: 'Draft', cls: 'bg-amber-500/15 text-amber-700' },
  active: { label: 'Kicked off', cls: 'bg-emerald-500/15 text-emerald-700' },
  closed: { label: 'Closed out', cls: 'bg-muted text-muted-foreground' },
}

/**
 * Kickoff charter — the front-door alignment doc (goals / working agreement / success criteria) both sides
 * acknowledge to kick off, plus a close-out reflection at the end (which links to the formal final review,
 * not duplicates it). Collaborative: editing re-aligns acknowledgments; both acknowledge → kicked off.
 */
export function CharterPanel({ contractId, initial }: { contractId: string; initial: Charter }) {
  const router = useRouter()
  const empty = !initial.goals && !initial.workingAgreement && !initial.successCriteria
  const [editing, setEditing] = useState(initial.status === 'draft' && empty)
  const [doc, setDoc] = useState({ goals: initial.goals ?? '', workingAgreement: initial.workingAgreement ?? '', successCriteria: initial.successCriteria ?? '' })
  const [closeNote, setCloseNote] = useState(initial.closeOutNote ?? '')
  const [closingOut, setClosingOut] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const iAck = initial.myRole === 'contractor' ? initial.contractorAcknowledged : initial.clientAcknowledged
  const otherAck = initial.myRole === 'contractor' ? initial.clientAcknowledged : initial.contractorAcknowledged
  const otherRole = initial.myRole === 'contractor' ? 'client' : 'contractor'
  const st = STATUS[initial.status]

  function act(fn: () => Promise<{ ok?: true; error?: string }>, after?: () => void) {
    setErr(null)
    start(async () => {
      const r = await fn()
      if ('error' in r && r.error) setErr(r.error)
      else { after?.(); router.refresh() }
    })
  }

  function save() {
    if (!doc.goals.trim() && !doc.workingAgreement.trim() && !doc.successCriteria.trim()) { setErr('Add at least one section.'); return }
    act(() => saveCharterAction(contractId, doc), () => setEditing(false))
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Compass className="size-4 text-muted-foreground" /> Kickoff charter</h2>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">Align on goals, how you&apos;ll work, and what success looks like — then both kick it off. Reflect together at the close.</p>

      {editing ? (
        <div className="space-y-3">
          {SECTIONS.map((s) => (
            <div key={s.key}>
              <label className="text-sm font-medium">{s.label}</label>
              <p className="mb-1 text-xs text-muted-foreground">{s.hint}</p>
              <textarea value={doc[s.key]} onChange={(e) => setDoc({ ...doc, [s.key]: e.target.value })} rows={3} className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
            </div>
          ))}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={save} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">{pending ? <Loader2 className="size-4 animate-spin" /> : null} Save</button>
            {!empty && <button type="button" onClick={() => { setEditing(false); setDoc({ goals: initial.goals ?? '', workingAgreement: initial.workingAgreement ?? '', successCriteria: initial.successCriteria ?? '' }) }} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">Cancel</button>}
          </div>
          <p className="text-xs text-muted-foreground">Saving re-aligns acknowledgments — both sides confirm the latest version.</p>
        </div>
      ) : empty ? (
        <button type="button" onClick={() => setEditing(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"><Pencil className="size-4" /> Draft the charter</button>
      ) : (
        <div className="space-y-3">
          {SECTIONS.map((s) => initial[s.key] && (
            <div key={s.key}>
              <p className="text-sm font-medium">{s.label}</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{initial[s.key]}</p>
            </div>
          ))}

          {initial.status !== 'closed' && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              {iAck ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Check className="size-3.5" /> You acknowledged</span>
              ) : (
                <button type="button" onClick={() => act(() => acknowledgeCharterAction(contractId))} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"><Check className="size-3.5" /> Acknowledge &amp; kick off</button>
              )}
              <span className="text-xs text-muted-foreground">{otherAck ? `The ${otherRole} acknowledged` : `Waiting on the ${otherRole}`}</span>
              <button type="button" onClick={() => setEditing(true)} disabled={pending} className="ml-auto inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm font-medium hover:bg-muted"><Pencil className="size-3.5" /> Amend</button>
            </div>
          )}

          {initial.status === 'active' && (
            <p className="text-xs text-emerald-700">Kicked off{initial.kickedOffAt ? ` · ${fmtDate(initial.kickedOffAt)}` : ''}.</p>
          )}

          {/* Close-out — available once kicked off; links to the formal final review */}
          {initial.status === 'active' && (
            <div className="border-t border-border pt-3">
              {closingOut ? (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium"><Flag className="size-4 text-muted-foreground" /> Close-out reflection</p>
                  <textarea value={closeNote} onChange={(e) => setCloseNote(e.target.value)} rows={3} placeholder="How did it go? What worked, what you'd carry forward." className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => act(() => closeOutCharterAction(contractId, closeNote.trim()), () => setClosingOut(false))} disabled={pending} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">{pending ? <Loader2 className="size-3.5 animate-spin" /> : <Flag className="size-3.5" />} Close out</button>
                    <button type="button" onClick={() => setClosingOut(false)} className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-sm hover:bg-muted">Cancel</button>
                  </div>
                  <p className="text-xs text-muted-foreground">This is a shared reflection — leave your formal rating in the Reviews section below.</p>
                </div>
              ) : (
                <button type="button" onClick={() => setClosingOut(true)} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm font-medium hover:bg-muted"><Flag className="size-3.5" /> Write the close-out</button>
              )}
            </div>
          )}

          {initial.status === 'closed' && (
            <div className="border-t border-border pt-3">
              <p className="flex items-center gap-1.5 text-sm font-medium"><Flag className="size-4 text-muted-foreground" /> Close-out{initial.closedAt ? ` · ${fmtDate(initial.closedAt)}` : ''}</p>
              {initial.closeOutNote ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{initial.closeOutNote}</p> : <p className="text-sm text-muted-foreground">No reflection left.</p>}
            </div>
          )}

          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
      )}
    </section>
  )
}
