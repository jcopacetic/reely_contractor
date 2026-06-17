'use client'

import { useState, useTransition } from 'react'
import { Loader2, Check, X, ShieldCheck, UserPlus, Ban, RotateCcw, ExternalLink, Inbox, PlayCircle, CreditCard, Scale, Tags } from 'lucide-react'
import {
  approveApplicantAction,
  rejectApplicantAction,
  suspendContractorAction,
  reinstateContractorAction,
  suspendClientAction,
  reinstateClientAction,
  resolveDisputeAction,
  createInviteAction,
  runBillingCycleAction,
  approveSkillAction,
  rejectSkillAction,
} from './actions'

type Party = { name: string | null; email: string | null }
type Dispute = { disputeId: string; billingCycleId: string; contractId: string; contractTitle: string; amount: number; reason: string; raisedByUserId: string; raisedByRole: 'client' | 'contractor'; clientUserId: string; contractorUserId: string; card: { hasCard: boolean; brand: string | null; last4: string | null }; createdAt: string; client: Party; contractor: Party }

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
type ClientStanding = { clientUserId: string; status: string; reason: string | null; activeContracts: number; suspendedAt: string | null; name: string | null; email: string | null }
type SkillRequest = { id: string; name: string; slug: string; requestedBy: string | null; order: number }

const CONTRACTOR_REASONS = [
  { v: 'conduct', l: 'Conduct concern' },
  { v: 'quality', l: 'Quality concern' },
  { v: 'inactivity', l: 'Inactivity' },
  { v: 'terms_violation', l: 'Terms violation' },
  { v: 'request', l: 'By request' },
  { v: 'other', l: 'Other' },
]
const CLIENT_REASONS = [
  { v: 'payment_declined', l: 'Payment declined' },
  { v: 'non_payment', l: 'Non-payment' },
  { v: 'abuse', l: 'Abuse concern' },
  { v: 'terms_violation', l: 'Terms violation' },
  { v: 'request', l: 'By request' },
  { v: 'other', l: 'Other' },
]

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

export function AdminConsole({ applicants, clients, disputes, skillRequests }: { applicants: Applicant[]; clients: ClientStanding[]; disputes: Dispute[]; skillRequests: SkillRequest[] }) {
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

      <DisputeArea disputes={disputes} />
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

      <SkillRequests requests={skillRequests} />
      <ClientStandings clients={clients} />
      <ManageContractor />
      <OpsPanel />
    </main>
  )
}

function SkillRequests({ requests }: { requests: SkillRequest[] }) {
  const [rows, setRows] = useState(requests)
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()
  if (rows.length === 0) return null // hidden when clear

  function act(id: string, kind: 'approve' | 'reject') {
    setBusy(id)
    start(async () => {
      const r = kind === 'approve' ? await approveSkillAction(id) : await rejectSkillAction(id)
      if (!r.error) setRows((xs) => xs.filter((x) => x.id !== id))
      setBusy(null)
    })
  }

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
        <Tags className="size-4 text-muted-foreground" /> Skill requests
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{rows.length}</span>
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">Contractors requested these skills. Approving adds them to the shared list (matchable on jobs); rejecting removes the request.</p>
      <ul className="space-y-2">
        {rows.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{s.name}</p>
              <p className="truncate text-xs text-muted-foreground">{s.slug}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => act(s.id, 'approve')} disabled={busy === s.id} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
                {busy === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Approve
              </button>
              <button type="button" onClick={() => act(s.id, 'reject')} disabled={busy === s.id} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:text-destructive disabled:opacity-60">
                <X className="size-3.5" /> Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ClientStandings({ clients }: { clients: ClientStanding[] }) {
  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold"><CreditCard className="size-4 text-muted-foreground" /> Client billing standing</h2>
      <p className="mb-3 text-sm text-muted-foreground">Shut a client&apos;s contracting on or off. Suspending stops their contractors&apos; timers, holds their contracts, and emails both sides. A declined weekly charge does this automatically.</p>
      {clients.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No clients with contracts yet.</p>
      ) : (
        <ul className="space-y-2">
          {clients.map((c) => <ClientRow key={c.clientUserId} c={c} />)}
        </ul>
      )}
    </section>
  )
}

function ClientRow({ c }: { c: ClientStanding }) {
  const [reason, setReason] = useState(CLIENT_REASONS[0]!.v)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [pending, start] = useTransition()
  const suspended = c.status === 'suspended'

  function act(kind: 'suspend' | 'reinstate') {
    setMsg(null)
    start(async () => {
      const r = kind === 'suspend' ? await suspendClientAction(c.clientUserId, reason) : await reinstateClientAction(c.clientUserId)
      if ('error' in r && r.error) setMsg({ kind: 'err', text: r.error })
      else setMsg({ kind: 'ok', text: kind === 'suspend' ? 'Client suspended.' : 'Client reinstated.' })
    })
  }

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            {c.name ?? c.email ?? <span className="font-mono text-xs text-muted-foreground">{c.clientUserId}</span>}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${suspended ? 'bg-destructive/15 text-destructive' : 'bg-emerald-500/15 text-emerald-700'}`}>{suspended ? 'Suspended' : 'Active'}</span>
          </p>
          <p className="text-xs text-muted-foreground">{c.email && c.name ? `${c.email} · ` : ''}{c.activeContracts} active contract{c.activeContracts === 1 ? '' : 's'}{suspended && c.reason ? ` · ${c.reason}` : ''}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {suspended ? (
            <button type="button" onClick={() => act('reinstate')} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60"><RotateCcw className="size-4" /> Reinstate</button>
          ) : (
            <>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
                {CLIENT_REASONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
              </select>
              <button type="button" onClick={() => act('suspend')} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-destructive/40 px-3 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-60">{pending ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />} Suspend</button>
            </>
          )}
        </div>
      </div>
      {msg && <p className={`mt-2 text-sm ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-destructive'}`}>{msg.text}</p>}
    </li>
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

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function DisputeArea({ disputes }: { disputes: Dispute[] }) {
  const [rows, setRows] = useState(disputes)
  if (rows.length === 0) return null // hidden when clear — disputes are the urgent, top-of-console item
  return (
    <section className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
        <Scale className="size-4 text-amber-600" /> Billing disputes
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-700">{rows.length}</span>
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">Invoices contested inside the review period. The charge is on hold until you uphold it (proceeds to charge) or waive it (the cycle is voided).</p>
      <ul className="space-y-3">
        {rows.map((d) => <DisputeRow key={d.disputeId} d={d} onResolved={(id) => setRows((r) => r.filter((x) => x.disputeId !== id))} />)}
      </ul>
    </section>
  )
}

function DisputeRow({ d, onResolved }: { d: Dispute; onResolved: (id: string) => void }) {
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const contact = (p: Party, id: string) => p.name ?? p.email ?? `${id.slice(0, 10)}…`

  function resolve(resolution: 'charge' | 'void') {
    setErr(null)
    start(async () => {
      const r = await resolveDisputeAction(d.disputeId, resolution, note.trim() || undefined)
      if ('error' in r && r.error) setErr(r.error)
      else onResolved(d.disputeId)
    })
  }

  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{d.contractTitle} · <span className="font-semibold">{usd(d.amount)}</span></p>
          <p className="text-xs text-muted-foreground">Raised by the <span className="font-medium capitalize">{d.raisedByRole}</span> · {new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${d.card.hasCard ? 'bg-emerald-500/15 text-emerald-700' : 'bg-destructive/15 text-destructive'}`}>
          {d.card.hasCard ? `${d.card.brand ?? 'card'} •••• ${d.card.last4 ?? '????'}` : 'No card on file'}
        </span>
      </div>
      <p className="mb-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">{d.reason}</p>
      <div className="mb-3 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <p><span className="font-medium text-foreground">Client:</span> {contact(d.client, d.clientUserId)}{d.client.email && d.client.name ? ` · ${d.client.email}` : ''}</p>
        <p><span className="font-medium text-foreground">Contractor:</span> {contact(d.contractor, d.contractorUserId)}{d.contractor.email && d.contractor.name ? ` · ${d.contractor.email}` : ''}</p>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution note (optional)" className="mb-2 h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => resolve('charge')} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">{pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Uphold · charge</button>
        <button type="button" onClick={() => resolve('void')} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3.5 text-sm font-medium hover:bg-muted disabled:opacity-60"><X className="size-4" /> Waive · void</button>
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

function OpsPanel() {
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [pending, start] = useTransition()

  function run() {
    setMsg(null)
    start(async () => {
      const r = await runBillingCycleAction()
      if ('error' in r && r.error) setMsg({ kind: 'err', text: r.error })
      else setMsg({ kind: 'ok', text: 'Billing cycle enqueued — watch the worker log + the cycle rows.' })
    })
  }

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
        <PlayCircle className="size-4 text-muted-foreground" /> Operations
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">Run the weekly billing tick now — sweeps approved time into cycles and charges any past their dispute window. Same job as the Sunday 18:00 UTC cron; idempotent per period, so it&apos;s safe to run anytime.</p>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />} Run billing cycle now
      </button>
      {msg && <p className={`mt-2 text-sm ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-destructive'}`}>{msg.text}</p>}
    </section>
  )
}

function ManageContractor() {
  const [userId, setUserId] = useState('')
  const [reason, setReason] = useState(CONTRACTOR_REASONS[0]!.v)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [pending, start] = useTransition()

  function act(kind: 'suspend' | 'reinstate') {
    setMsg(null)
    const id = userId.trim()
    if (!id) return
    start(async () => {
      const r = kind === 'suspend' ? await suspendContractorAction(id, reason) : await reinstateContractorAction(id)
      if ('error' in r && r.error) setMsg({ kind: 'err', text: r.error })
      else setMsg({ kind: 'ok', text: kind === 'suspend' ? 'Contractor disabled (timers stopped, their clients alerted).' : 'Contractor reinstated.' })
    })
  }

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
        <Ban className="size-4 text-muted-foreground" /> Manage a contractor
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">Disable or reinstate a contractor by their Clerk user id. Disabling stops their timers, alerts the clients on their active contracts, and emails them.</p>
      <div className="flex flex-wrap gap-2">
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="user_xxx (Clerk user id)"
          className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary"
        />
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-10 rounded-md border border-border bg-background px-2 text-sm">
          {CONTRACTOR_REASONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
        </select>
        <button
          type="button"
          onClick={() => act('suspend')}
          disabled={pending || !userId.trim()}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-destructive/40 px-3.5 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-60"
        >
          <Ban className="size-4" /> Disable
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
