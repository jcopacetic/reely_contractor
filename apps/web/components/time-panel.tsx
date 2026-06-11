'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Play, Square, Trash2, Plus, Check, Clock } from 'lucide-react'
import { startTimerAction, stopTimerAction, cancelTimerAction, addManualTimeAction, approveTimeAction, unapproveTimeAction } from '@/app/contractor/actions'

type Source = 'timer' | 'extension' | 'manual'
type Entry = { id: string; startedAt: string; endedAt: string | null; durationSeconds: number; description: string | null; source: Source; approved: boolean; approvedAt: string | null; running: boolean }
export type TimeSummary = { entries: Entry[]; approvedSeconds: number; pendingSeconds: number; runningEntryId: string | null }

const inputCls = 'h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary'
const SOURCE_LABEL: Record<Source, string> = { timer: 'Timer', extension: 'Extension', manual: 'Manual' }

/** seconds → "1h 23m" (compact) or "0m" */
function hm(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
/** live "H:MM:SS" for the running clock */
function hms(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
const hours = (s: number) => s / 3600

/**
 * Time tracking on a contract. The contractor runs the timer (start/stop), adds manual entries, and sees the
 * full log; the client approves entries (only approved time bills). The running clock ticks locally from the
 * entry's started_at. Billing/charge is the payments slice — this panel surfaces approved vs pending only.
 */
export function TimePanel({ contractId, role, rateType, rateAmount, active, initial }: { contractId: string; role: 'client' | 'contractor'; rateType: 'hourly' | 'fixed'; rateAmount: number; active: boolean; initial: TimeSummary }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)

  const running = initial.entries.find((e) => e.id === initial.runningEntryId) ?? null
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!running) return
    const startedMs = new Date(running.startedAt).getTime()
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [running])

  const run = (fn: () => Promise<{ error?: string }>) => {
    setErr(null)
    start(async () => {
      const r = await fn()
      if (r.error) setErr(r.error)
      else router.refresh()
    })
  }

  const approvedHours = hours(initial.approvedSeconds)
  const pendingHours = hours(initial.pendingSeconds)
  const billable = rateType === 'hourly' ? approvedHours * rateAmount : null

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Clock className="size-4" /> Time tracking
      </h2>

      {/* Summary */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Approved" value={hm(initial.approvedSeconds)} sub={billable != null ? `≈ $${billable.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : `${approvedHours.toFixed(1)}h`} accent />
        <Stat label="Pending" value={hm(initial.pendingSeconds)} sub={`${pendingHours.toFixed(1)}h awaiting approval`} />
        <Stat label="Rate" value={rateType === 'hourly' ? `$${rateAmount}/hr` : `$${rateAmount} fixed`} sub={rateType === 'fixed' ? 'time is informational' : 'billed on approval'} />
      </div>

      {/* Contractor controls: timer + manual */}
      {role === 'contractor' && (
        <div className="mb-4 rounded-lg border border-border/60 bg-background p-3">
          {running ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" /></span>
                <span className="font-mono text-lg font-semibold tabular-nums">{hms(elapsed)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => run(() => stopTimerAction(running.id))} disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />} Stop
                </button>
                <button onClick={() => run(() => cancelTimerAction(running.id))} disabled={pending} title="Discard" className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive disabled:opacity-50">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => run(() => startTimerAction(contractId))} disabled={pending || !active} title={active ? 'Start the timer' : 'Contract is not active'} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Start timer
              </button>
              <button onClick={() => setManualOpen((o) => !o)} disabled={!active} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-50">
                <Plus className="size-4" /> Manual entry
              </button>
            </div>
          )}
          {manualOpen && !running && <ManualEntry contractId={contractId} onDone={() => { setManualOpen(false); router.refresh() }} onError={setErr} />}
        </div>
      )}

      {err && <p className="mb-3 text-sm text-destructive">{err}</p>}

      {/* Entry log */}
      {initial.entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No time logged yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {initial.entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium tabular-nums">{e.running ? 'running…' : hm(e.durationSeconds)}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{SOURCE_LABEL[e.source]}</span>
                  {e.approved && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Approved</span>}
                </div>
                {e.description && <p className="truncate text-xs text-muted-foreground">{e.description}</p>}
                <p className="text-[11px] text-muted-foreground">{new Date(e.startedAt).toLocaleString()}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {role === 'client' && !e.running && !e.approved && (
                  <button onClick={() => run(() => approveTimeAction(e.id))} disabled={pending} className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    <Check className="size-3" /> Approve
                  </button>
                )}
                {role === 'client' && e.approved && (
                  <button onClick={() => run(() => unapproveTimeAction(e.id))} disabled={pending} className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50">
                    Revoke
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${accent ? 'border-primary/30 bg-primary/5' : 'border-border/60'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function ManualEntry({ contractId, onDone, onError }: { contractId: string; onDone: () => void; onError: (e: string | null) => void }) {
  const [pending, start] = useTransition()
  const [startedAt, setStartedAt] = useState('')
  const [endedAt, setEndedAt] = useState('')
  const [description, setDescription] = useState('')

  function submit() {
    onError(null)
    if (!startedAt || !endedAt) return onError('Set both a start and end time.')
    const s = new Date(startedAt)
    const e = new Date(endedAt)
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return onError('Invalid date.')
    if (e <= s) return onError('End must be after start.')
    start(async () => {
      const r = await addManualTimeAction(contractId, { startedAt: s.toISOString(), endedAt: e.toISOString(), description: description.trim() || null })
      if (r.error) onError(r.error)
      else onDone()
    })
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Start<input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} className={`${inputCls} mt-0.5 w-full`} /></label>
        <label className="text-xs text-muted-foreground">End<input type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} className={`${inputCls} mt-0.5 w-full`} /></label>
      </div>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What did you work on? (optional)" className={`${inputCls} w-full`} />
      <button onClick={submit} disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add entry
      </button>
    </div>
  )
}
