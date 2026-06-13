'use client'

import { useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { MessageSquarePlus, X, Loader2, Check } from 'lucide-react'
import { submitFeedbackAction } from '@/app/feedback-actions'

const CATS = [
  ['bug', 'Bug'],
  ['idea', 'Idea'],
  ['other', 'Other'],
] as const
type Cat = (typeof CATS)[number][0]

/**
 * Beta feedback widget — a corner button → a small panel for a bug/idea/message. Surface-aware (sends the current
 * path) and posts to the Catalog feedback sink via the local server action. Rendered only for signed-in users
 * (wrapped in Clerk <SignedIn> at the layout). Present on every node.
 */
export function BetaFeedback() {
  const path = usePathname() ?? '/'
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<Cat>('idea')
  const [body, setBody] = useState('')
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const send = () => {
    if (!body.trim()) return
    setErr(null)
    start(async () => {
      const r = await submitFeedbackAction(category, body.trim(), path)
      if (r?.error) setErr(r.error)
      else {
        setDone(true)
        setBody('')
        setTimeout(() => { setDone(false); setOpen(false) }, 1200)
      }
    })
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="Beta feedback" className="fixed bottom-4 right-4 z-50 inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium shadow-lg transition hover:bg-muted">
        <MessageSquarePlus className="size-4 text-primary" /> Feedback
      </button>
    )
  }
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-3 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">Beta feedback</span>
        <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
      </div>
      {done ? (
        <p className="flex items-center gap-1.5 py-4 text-sm text-emerald-600"><Check className="size-4" /> Thanks — sent!</p>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-1">
            {CATS.map(([v, l]) => (
              <button key={v} onClick={() => setCategory(v)} className={`flex-1 rounded-md border px-2 py-1 text-xs transition ${category === v ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>{l}</button>
            ))}
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={5000} placeholder="What's up? Bugs, ideas, anything…" className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary" />
          {err && <p className="text-xs text-destructive">{err}</p>}
          <button onClick={send} disabled={pending || !body.trim()} className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
            {pending && <Loader2 className="size-4 animate-spin" />} Send
          </button>
          <p className="truncate text-[10px] text-muted-foreground">On {path}</p>
        </div>
      )}
    </div>
  )
}
