'use client'

import { useState, useTransition } from 'react'
import { DollarSign, MapPin, Loader2, Check, Send, Briefcase } from 'lucide-react'
import { requestHireAction } from './actions'

const inputCls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary'

/**
 * The hire box — rate + location at a glance, and a low-friction "Request to hire" form that captures a lead the
 * contractor receives in-app + by email. The formal contract is struck through Board; this is the first touch.
 */
export function HireBox({ slug, displayName, ratePublic, location, accepting }: { slug: string; displayName: string; ratePublic: number | null; location: string | null; accepting: boolean }) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [projectType, setProjectType] = useState('')
  const [budget, setBudget] = useState('')
  const [message, setMessage] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const firstName = displayName.split(' ')[0] || displayName

  function submit() {
    setErr(null)
    if (!name.trim()) { setErr('Add your name.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Add a valid email.'); return }
    if (!message.trim()) { setErr('Add a short message.'); return }
    start(async () => {
      const r = await requestHireAction({ slug, fromName: name.trim(), fromEmail: email.trim(), message: message.trim(), projectType: projectType.trim() || null, budget: budget.trim() || null })
      if (r.error) { setErr(r.error === 'not_found' ? 'This profile isn’t accepting requests right now.' : 'Something went wrong — please try again.'); return }
      setDone(true)
    })
  }

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-4 text-left shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5 text-sm">
          <p className="flex items-center gap-1.5 font-semibold"><DollarSign className="size-4 text-muted-foreground" /> {ratePublic ? `$${ratePublic}/hr` : 'Rate on request'}</p>
          {location && <p className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="size-3.5" /> {location}</p>}
        </div>
        {!open && !done && (
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/projects?invite=${encodeURIComponent(slug)}`} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">
              <Briefcase className="size-4" /> Hire on Board
            </a>
            <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">
              <Send className="size-4" /> {accepting ? 'Request to hire' : 'Get in touch'}
            </button>
          </div>
        )}
      </div>

      {done ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"><Check className="size-4" /> Sent — {firstName} will get back to you by email.</p>
      ) : open ? (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={inputCls} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" type="email" className={inputCls} />
            <input value={projectType} onChange={(e) => setProjectType(e.target.value)} placeholder="Project type (optional)" className={inputCls} />
            <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Budget (optional)" className={inputCls} />
          </div>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder={`What would you like ${firstName} to help with?`} className={`${inputCls} resize-y`} />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={submit} disabled={pending} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send request
            </button>
            <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-md border border-border px-3 text-sm hover:bg-muted">Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
