import { TrendingUp, FileCheck, Wallet } from 'lucide-react'

export type PartyStats = {
  contracts: { total: number; active: number; completed: number; cancelled: number; other: number }
  successRate: number | null
  money: { total: number; currency: string; monthly: Array<{ month: string; amount: number }> }
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const usd2 = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y!, (m ?? 1) - 1, 1)).toLocaleDateString('en-US', { month: 'short' })
}

/** A compact financial stats card — contracts ran, completion-based success rate, and money over the trailing
 *  six months. `side` flips the money label (contractor "earned" vs client "spent"). Server component. */
export function StatsPanel({ stats, side }: { stats: PartyStats; side: 'contractor' | 'client' }) {
  const moneyLabel = side === 'contractor' ? 'Earned' : 'Spent'
  const peak = Math.max(1, ...stats.money.monthly.map((m) => m.amount))
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold"><TrendingUp className="size-4 text-muted-foreground" /> Your stats</h2>
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Tile icon={<FileCheck className="size-4" />} label="Contracts" value={String(stats.contracts.total)} sub={`${stats.contracts.active} active · ${stats.contracts.completed} done`} />
        <Tile icon={<TrendingUp className="size-4" />} label="Success rate" value={stats.successRate == null ? '—' : `${stats.successRate}%`} sub={stats.successRate == null ? 'no contracts ended yet' : `${stats.contracts.completed}/${stats.contracts.completed + stats.contracts.cancelled} completed`} />
        <Tile icon={<Wallet className="size-4" />} label={`${moneyLabel} (all time)`} value={usd(stats.money.total)} sub={usd2(stats.money.total)} accent />
      </div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{moneyLabel} · last 6 months</p>
      <div className="flex items-end gap-2" style={{ height: 96 }}>
        {stats.money.monthly.map((m) => (
          <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full flex-1 items-end" title={usd2(m.amount)}>
              <div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.round((m.amount / peak) * 100)}%`, minHeight: m.amount > 0 ? 4 : 0 }} />
            </div>
            <span className="text-[10px] text-muted-foreground">{monthLabel(m.month)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Tile({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'border-primary/30 bg-primary/[0.04]' : 'border-border'}`}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</p>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
    </div>
  )
}
