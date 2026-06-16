'use client'

import { useState, useTransition } from 'react'
import { Loader2, Check, X, ShieldCheck, UserPlus, Ban, RotateCcw, ExternalLink, Inbox } from 'lucide-react'
import {
  approveApplicantAction,
  rejectApplicantAction,
  suspendContractorAction,
  reinstateContractorAction,
  createInviteAction,
} from './actions'

type Applicant = {
  id: string
  clerkUserId: string
  source: string
  status: string
  videoLink: string | null
  createdAt: string
  name: string | null
  email: string | null
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

export function AdminConsole({ applicants }: { applicants: Applicant[] }) {
  const [rows, setRows] = useState(applicants)

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-center gap-2.5">
        <ShieldCheck className="size-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Contractor vetting</h1>
          <p className="text-sm text-muted-foreground">Approve applicants into the club, invite by email, and manage access.</p>
        </div>
      </header>

      <InvitePanel />

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
          <Inbox className="size-4 text-muted-foreground" /> Vetting queue
          {rows.length > 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{rows.length}</span>}
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No applications waiting. New applicants land here for review.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((a) => (
              <QueueRow key={a.id} a={a} onDecided={(id) => setRows((r) => r.filter((x) => x.id !== id))} />
            ))}
          </ul>
        )}
      </section>

      <ManageContractor />
    </main>
  )
}

function QueueRow({ a, onDecided }: { a: Applicant; onDecided: (id: string) => void }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function decide(kind: 'approve' | 'reject') {
    setErr(null)
    start(async () => {
      const r = kind === 'approve' ? await approveApplicantAction(a.clerkUserId) : await rejectApplicantAction(a.clerkUserId)
      if ('error' in r && r.error) setErr(r.error)
      else onDecided(a.id)
    })
  }

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{a.name ?? a.email ?? <span className="font-mono text-sm text-muted-foreground">{a.clerkUserId}</span>}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {a.email && a.name && <span>{a.email}</span>}
            <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium capitalize">{a.source}</span>
            <span>Applied {fmtDate(a.createdAt)}</span>
            {a.status === 'in_review' && <span className="text-amber-600">In review</span>}
            {a.videoLink && (
              <a href={a.videoLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                Intro <ExternalLink className="size-3" />
              </a>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => decide('reject')}
            disabled={pending}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            <X className="size-4" /> Reject
          </button>
          <button
            type="button"
            onClick={() => decide('approve')}
            disabled={pending}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Approve
          </button>
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </li>
  )
}

function InvitePanel() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function send() {
    setErr(null)
    setCode(null)
    start(async () => {
      const r = await createInviteAction(email.trim())
      if (r.error) setErr(r.error)
      else if (r.code) {
        setCode(r.code)
        setEmail('')
      }
    })
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
        <UserPlus className="size-4 text-muted-foreground" /> Invite by email
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">Mint an invite code. Share it with them — they redeem it on the apply page and skip straight to a reviewed application.</p>
      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || !email.trim()}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Create invite
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      {code && (
        <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          <p className="font-medium text-emerald-700">Invite created.</p>
          <p className="mt-1 text-muted-foreground">
            Code: <code className="select-all rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{code}</code> — they redeem it at <span className="font-medium text-foreground">reely.io/contractor/apply</span>.
          </p>
        </div>
      )}
    </section>
  )
}

function ManageContractor() {
  const [userId, setUserId] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [pending, start] = useTransition()

  function act(kind: 'suspend' | 'reinstate') {
    setMsg(null)
    const id = userId.trim()
    if (!id) return
    start(async () => {
      const r = kind === 'suspend' ? await suspendContractorAction(id) : await reinstateContractorAction(id)
      if ('error' in r && r.error) setMsg({ kind: 'err', text: r.error })
      else setMsg({ kind: 'ok', text: kind === 'suspend' ? 'Contractor suspended.' : 'Contractor reinstated.' })
    })
  }

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
        <Ban className="size-4 text-muted-foreground" /> Manage a contractor
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">Suspend or reinstate an existing contractor by their Clerk user id.</p>
      <div className="flex flex-wrap gap-2">
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="user_xxx (Clerk user id)"
          className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => act('suspend')}
          disabled={pending || !userId.trim()}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-destructive/40 px-3.5 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-60"
        >
          <Ban className="size-4" /> Suspend
        </button>
        <button
          type="button"
          onClick={() => act('reinstate')}
          disabled={pending || !userId.trim()}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-border px-3.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          <RotateCcw className="size-4" /> Reinstate
        </button>
      </div>
      {msg && <p className={`mt-2 text-sm ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-destructive'}`}>{msg.text}</p>}
    </section>
  )
}
