'use client'

import { useState, useTransition } from 'react'
import { Loader2, MessageSquareText, Send } from 'lucide-react'
import { postStandupAction } from '@/app/contractor/actions'

export type Standup = { id: string; byUserId: string; done: string; next: string; blockers: string | null; createdAt: string; fromMe: boolean }

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

/**
 * Stand-ups on a contract — structured progress updates (done / next / blockers). v1: the contractor posts;
 * both parties see the history. The client-request/cadence + chat-post + billing gate land in later tasks.
 */
export function StandupPanel({ contractId, role, initial }: { contractId: string; role: 'client' | 'contractor'; initial: Standup[] }) {
  const [rows, setRows] = useState(initial)
  const [done, setDone] = useState('')
  const [next, setNext] = useState('')
  const [blockers, setBlockers] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    setErr(null)
    if (!done.trim() || !next.trim()) {
      setErr('Add what got done and what’s next.')
      return
    }
    start(async () => {
      const r = await postStandupAction(contractId, { done: done.trim(), next: next.trim(), blockers: blockers.trim() || undefined })
      if ('error' in r && r.error) {
        setErr(r.error)
        return
      }
      setRows((cur) => [{ id: `tmp-${cur.length}-${cur[0]?.id ?? '0'}`, byUserId: '', done: done.trim(), next: next.trim(), blockers: blockers.trim() || null, createdAt: new Date().toISOString(), fromMe: true }, ...cur])
      setDone('')
      setNext('')
      setBlockers('')
    })
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
        <MessageSquareText className="size-4 text-muted-foreground" /> Stand-ups
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">Structured progress updates on this contract — what got done, what&rsquo;s next, and any blockers.</p>

      {role === 'contractor' && (
        <div className="mb-5 space-y-3 rounded-lg border border-border bg-background p-4">
          <Field label="What got done" value={done} onChange={setDone} placeholder="Since the last update…" />
          <Field label="What&rsquo;s next" value={next} onChange={setNext} placeholder="The plan for the next stretch…" />
          <Field label="Blockers (optional)" value={blockers} onChange={setBlockers} placeholder="Anything you&rsquo;re waiting on or stuck on…" />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Post stand-up
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stand-ups yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => (
            <li key={s.id} className="rounded-lg border border-border p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{s.fromMe ? 'You' : role === 'contractor' ? 'Client' : 'Contractor'}</span>
                <span>{fmt(s.createdAt)}</span>
              </div>
              <Line label="Done" body={s.done} />
              <Line label="Next" body={s.next} />
              {s.blockers && <Line label="Blockers" body={s.blockers} accent />}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="text-sm font-medium text-foreground">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </div>
  )
}

function Line({ label, body, accent }: { label: string; body: string; accent?: boolean }) {
  return (
    <p className="mt-1 text-sm">
      <span className={`mr-1.5 text-xs font-semibold uppercase tracking-wide ${accent ? 'text-amber-600' : 'text-muted-foreground'}`}>{label}</span>
      <span className="whitespace-pre-wrap text-foreground">{body}</span>
    </p>
  )
}
