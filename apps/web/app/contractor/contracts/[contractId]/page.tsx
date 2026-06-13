import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiQuery } from '@/lib/api'
import { ContractDetail } from '@/components/contract-detail'
import { TimePanel, type TimeSummary } from '@/components/time-panel'
import { BillingPanel, type Cycle } from '@/components/billing-panel'
import { ContractReviews, type Review } from '@/components/contract-reviews'

export const dynamic = 'force-dynamic'

type Item = { id: string; kind: 'milestone' | 'scope_add' | 'deliverable' | 'note'; title: string; description: string | null; amount: number | null; status: string; order: number }
type Contract = {
  id: string; title: string; listingTitle: string | null; boardRef: string | null
  clientUserId: string; contractorUserId: string; rateType: 'hourly' | 'fixed'; rateAmount: number
  status: string; role: 'client' | 'contractor'; startedAt: string; endedAt: string | null; items: Item[]
}

const EMPTY_TIME: TimeSummary = { entries: [], approvedSeconds: 0, pendingSeconds: 0, disputedSeconds: 0, runningEntryId: null }

export default async function ContractDetailPage({ params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params
  const [contract, time, cycles, reviews] = await Promise.all([
    apiQuery<Contract | null>('contracts.get', { contractId }).catch(() => null),
    apiQuery<TimeSummary | null>('time.listTime', { contractId }).catch(() => null),
    apiQuery<Cycle[] | null>('payments.cycles', { contractId }).catch(() => null),
    apiQuery<Review[] | null>('reviews.list', { contractId }).catch(() => null),
  ])
  if (!contract) notFound()
  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/contractor/contracts" className="text-sm text-muted-foreground hover:text-foreground">← All contracts</Link>
        <div className="mt-4 space-y-5">
          <ContractDetail contract={contract} />
          <TimePanel contractId={contract.id} role={contract.role} rateType={contract.rateType} rateAmount={contract.rateAmount} active={contract.status === 'active'} initial={time ?? EMPTY_TIME} />
          <BillingPanel cycles={cycles ?? []} role={contract.role} />
          <ContractReviews reviews={reviews ?? []} role={contract.role} />
        </div>
      </main>
    </>
  )
}
