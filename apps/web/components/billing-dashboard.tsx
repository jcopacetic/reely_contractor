'use client'

import { useState } from 'react'
import { ChevronRight, Wallet } from 'lucide-react'

export type BillingTask = { title: string; seconds: number; approved: boolean }
export type BillingRow = { contractId: string; title: string; status: 'in_progress' | 'in_review' | 'paid'; grossAmount: number; netAmount: number; seconds: number; taskCount: number; tasks: BillingTask[] }
export type BillingWeek = { periodStart: string; periodEnd: string; label: string; status: 'current' | 'recent'; rows: BillingRow[]; gross: number; net: number }

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const hrs = (s: number) => `${(s / 3600).toFixed(1)}h`

const STATUS: Record<string, { contractor: string; client: string; cls: string }> = {
  in_progress: { contractor: 'In progress', client: 'In progress', cls: 'bg-sky-500/15 text-sky-700' },
  in_review: { contractor: 'In review', client: 'To review', cls: 'bg-amber-500/15 text-amber-700' },
  paid: { contractor: 'Paid', client: 'Charged', cls: 'bg-emerald-500/15 text-emerald-700' },
}

/** Weekly billing dashboard — three week buckets, each a table of counterparty contracts with status + amount,
 *  expandable to the tasks settled that week. `side` flips the labels (contractor "Paid"/earns vs client
 *  "Charged"/pays). The amount shown is the contractor's net (earnings) or the client's gross (spend). */
export function BillingDashboard({ weeks, side }: { weeks: BillingWeek[]; side: 'contractor' | 'client' }) {
  const amountOf = (r: BillingRow) => (side === 'contractor' ? r.netAmount : r.grossAmount)
  const weekTotal = (w: BillingWeek) => (side === 'contractor' ? w.net : w.gross)
  const empty = weeks.every((w) => w.rows.length === 0)

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold"><Wallet className="size-4 text-muted-foreground" /> {side === 'contractor' ? 'Earnings' : 'Spend'}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{side === 'contractor' ? 'Your work in progress, in review, and paid — by week. Open a row to see the tasks behind it.' : 'Work in progress, to review, and charged — by week. Open a row to see the tasks behind it.'}</p>
      {empty ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No billing activity in the last three weeks.</p>
      ) : (
        <div className="space-y-5">
          {weeks.map((w) => (
            <div key={w.periodStart}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{w.label} <span className="font-normal text-muted-foreground">· {new Date(w.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></h3>
                {w.rows.length > 0 && <span className="text-sm font-semibold">{usd(weekTotal(w))}</span>}
              </div>
              {w.rows.length === 0 ? (
                <p className="rounded-lg border border-border/60 px-3 py-2.5 text-sm text-muted-foreground">Nothing this week.</p>
              ) : (
                <ul className="space-y-1.5">
                  {w.rows.map((r) => <Row key={r.contractId + w.periodStart} r={r} amount={amountOf(r)} side={side} />)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Row({ r, amount, side }: { r: BillingRow; amount: number; side: 'contractor' | 'client' }) {
  const [open, setOpen] = useState(false)
  const st = STATUS[r.status]!
  return (
    <li className="rounded-lg border border-border/60">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
        <ChevronRight className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.title}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{side === 'contractor' ? st.contractor : st.client}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{hrs(r.seconds)}</span>
        <span className="w-20 shrink-0 text-right text-sm font-semibold">{usd(amount)}</span>
      </button>
      {open && (
        <div className="border-t border-border/60 px-3 py-2">
          {r.tasks.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">No itemized tasks.</p>
          ) : (
            <ul className="space-y-1">
              {r.tasks.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-foreground">{t.title}{!t.approved && <span className="ml-1.5 text-amber-600">· pending</span>}</span>
                  <span className="shrink-0 text-muted-foreground">{hrs(t.seconds)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}
