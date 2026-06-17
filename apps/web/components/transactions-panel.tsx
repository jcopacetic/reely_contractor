import { Receipt, Download } from 'lucide-react'

export type LedgerRow = {
  id: string
  kind: string
  grossAmount: number
  netAmount: number
  description: string
  succeeded: boolean
  occurredAt: string
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmt = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const KIND: Record<string, string> = { charge: 'Charge', charge_failed: 'Declined', refund: 'Refund', chargeback: 'Chargeback', adjustment: 'Adjustment' }

/** A transaction listing with CSV/JSON export. `side` picks which amount to show (contractor net vs client gross)
 *  and where the download route lives. Server component — the export links hit a download route handler. */
export function TransactionsPanel({ rows, side, exportBase }: { rows: LedgerRow[]; side: 'contractor' | 'client'; exportBase: string }) {
  const amount = (r: LedgerRow) => (side === 'contractor' ? r.netAmount : r.grossAmount)
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Receipt className="size-4 text-muted-foreground" /> Transactions</h2>
        <div className="flex items-center gap-2">
          <a href={`${exportBase}?format=csv`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium hover:bg-muted"><Download className="size-3.5" /> CSV</a>
          <a href={`${exportBase}?format=json`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium hover:bg-muted"><Download className="size-3.5" /> JSON</a>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No transactions yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.slice(0, 100).map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${r.succeeded ? 'bg-emerald-500/15 text-emerald-700' : 'bg-destructive/15 text-destructive'}`}>{KIND[r.kind] ?? r.kind}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{r.description}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{fmt(r.occurredAt)}</span>
              <span className="w-24 shrink-0 text-right text-sm font-semibold">{usd(amount(r))}</span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 100 && <p className="mt-2 text-xs text-muted-foreground">Showing the latest 100 — export for the full record.</p>}
    </section>
  )
}
