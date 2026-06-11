import Link from 'next/link'
import { apiQuery } from '@/lib/api'
import { ContractorHeader } from '@/components/contractor-header'
import { budgetLabel } from '@/components/work-browse'

export const dynamic = 'force-dynamic'

type Contract = {
  id: string; title: string; listingTitle: string | null; boardRef: string | null
  clientUserId: string; contractorUserId: string; rateType: 'hourly' | 'fixed'; rateAmount: number
  status: string; role: 'client' | 'contractor'; startedAt: string
}

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-700',
  paused: 'bg-amber-500/15 text-amber-600',
  completed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/10 text-destructive',
}
const shortId = (s: string) => `…${s.slice(-5)}`

export default async function ContractsPage() {
  const contracts = await apiQuery<Contract[]>('contracts.listMine').catch(() => [] as Contract[])
  return (
    <>
      <ContractorHeader active="contracts" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-5 font-display text-2xl font-bold tracking-tight">Contracts</h1>
        {contracts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
            No contracts yet. They appear here when a bid is accepted or a client hires you.
          </div>
        ) : (
          <div className="space-y-3">
            {contracts.map((c) => (
              <Link key={c.id} href={`/contractor/contracts/${c.id}`} className="block rounded-xl border border-border bg-card p-4 transition hover:border-primary/50">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-base font-semibold">{c.title}</h2>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[c.status] ?? 'bg-muted'}`}>{c.status}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{budgetLabel(c.rateType, c.rateAmount)}</span>
                  <span>{c.role === 'contractor' ? `Client ${shortId(c.clientUserId)}` : `Contractor ${shortId(c.contractorUserId)}`}</span>
                  {c.boardRef && <span className="rounded-full bg-muted px-2 py-0.5">via Board</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
