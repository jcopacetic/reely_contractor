'use client'

import { useState, useTransition } from 'react'
import { Loader2, ClipboardCheck, Pencil } from 'lucide-react'
import { setDefinitionOfDoneAction } from '@/app/contractor/actions'

/**
 * Definition of Done on a contract — the acceptance bar both sides work to. v1: the contractor drafts it,
 * both parties see it (sets expectations up front). The mutual client-agree LOCK lands with the client-side
 * ceremony surface. Additive; contractor-side write only.
 */
export function DefinitionOfDonePanel({ contractId, role, initial }: { contractId: string; role: 'client' | 'contractor'; initial: string | null }) {
  const [saved, setSaved] = useState(initial ?? '')
  const [text, setText] = useState(initial ?? '')
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const canEdit = role === 'contractor'

  function save() {
    setErr(null)
    start(async () => {
      const r = await setDefinitionOfDoneAction(contractId, text.trim())
      if ('error' in r && r.error) {
        setErr(r.error)
        return
      }
      setSaved(text.trim())
      setEditing(false)
    })
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <ClipboardCheck className="size-4 text-muted-foreground" /> Definition of Done
        </h2>
        {canEdit && !editing && (
          <button type="button" onClick={() => { setText(saved); setEditing(true) }} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <Pencil className="size-3.5" /> {saved ? 'Edit' : 'Add'}
          </button>
        )}
      </div>
      <p className="mb-3 text-sm text-muted-foreground">The acceptance bar both sides work to — what &ldquo;done&rdquo; means for this contract.</p>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="e.g. All deliverables shipped to staging, reviewed, and signed off by the client; docs updated."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={save} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
          </div>
        </div>
      ) : saved ? (
        <p className="whitespace-pre-wrap text-sm text-foreground">{saved}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{canEdit ? 'Not set yet — add the acceptance criteria so expectations are clear up front.' : 'The contractor hasn’t set this yet.'}</p>
      )}
    </section>
  )
}
