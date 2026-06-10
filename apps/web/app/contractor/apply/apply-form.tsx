'use client'

import { useState, useTransition } from 'react'
import { Loader2, Send, CheckCircle2 } from 'lucide-react'
import { applyAction, redeemInviteAction } from '../actions'

/** Apply to the club, or redeem an invite code. Submits via server action → contractor-identity.apply. */
export function ApplyForm() {
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [code, setCode] = useState('')

  function submit(redeem: boolean) {
    setErr(null)
    start(async () => {
      const r = redeem ? await redeemInviteAction(code.trim()) : await applyAction()
      if ('error' in r) setErr(r.error)
      else setDone(true)
    })
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-2 size-7 text-emerald-600" />
        <p className="font-display text-lg font-semibold">Application submitted</p>
        <p className="mt-1 text-sm text-muted-foreground">We review every applicant by hand. You&apos;ll hear from us soon.</p>
        <a href="/contractor/status" className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">Check status</a>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => submit(false)}
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Apply to the club
      </button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or redeem an invite <span className="h-px flex-1 bg-border" />
      </div>

      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Invite code"
          className="h-11 flex-1 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={pending || !code.trim()}
          className="inline-flex h-11 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          Redeem
        </button>
      </div>

      {err && <p className="text-sm text-destructive">{err === 'invalid_code' ? 'That invite code is not valid.' : err === 'expired' ? 'That invite has expired.' : err === 'already_used' ? 'That invite was already used.' : err}</p>}
    </div>
  )
}
