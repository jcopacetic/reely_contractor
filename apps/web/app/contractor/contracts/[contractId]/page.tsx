import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiQuery } from '@/lib/api'
import { ContractDetail } from '@/components/contract-detail'
import { TimePanel, type TimeSummary } from '@/components/time-panel'
import { BillingPanel, type Cycle } from '@/components/billing-panel'
import { ContractReviews, type Review } from '@/components/contract-reviews'
import { StandupPanel, type Standup } from '@/components/standup-panel'
import { DefinitionOfDonePanel } from '@/components/definition-of-done-panel'
import { SprintPanel, type Sprint } from '@/components/sprint-panel'
import { BlockerPanel, type Blocker } from '@/components/blocker-panel'
import { ChangeRequestPanel, type ChangeRequest } from '@/components/change-request-panel'
import { CharterPanel, type Charter } from '@/components/charter-panel'

export const dynamic = 'force-dynamic'

type Item = { id: string; kind: 'milestone' | 'scope_add' | 'deliverable' | 'note'; title: string; description: string | null; amount: number | null; status: string; order: number }
type Contract = {
  id: string; title: string; listingTitle: string | null; boardRef: string | null
  clientUserId: string; contractorUserId: string; rateType: 'hourly' | 'fixed'; rateAmount: number
  status: string; definitionOfDone: string | null; standupRequestedAt: string | null; standupCadence: string | null; role: 'client' | 'contractor'; startedAt: string; endedAt: string | null; items: Item[]
}

const EMPTY_TIME: TimeSummary = { entries: [], approvedSeconds: 0, pendingSeconds: 0, disputedSeconds: 0, runningEntryId: null }

export default async function ContractDetailPage({ params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params
  const [contract, time, cycles, reviews, standups, sprints, blockers, changeRequests, charter] = await Promise.all([
    apiQuery<Contract | null>('contracts.get', { contractId }).catch(() => null),
    apiQuery<TimeSummary | null>('time.listTime', { contractId }).catch(() => null),
    apiQuery<Cycle[] | null>('payments.cycles', { contractId }).catch(() => null),
    apiQuery<Review[] | null>('reviews.list', { contractId }).catch(() => null),
    apiQuery<Standup[] | null>('standup.list', { contractId }).catch(() => null),
    apiQuery<Sprint[] | null>('sprint.list', { contractId }).catch(() => null),
    apiQuery<Blocker[] | null>('blocker.list', { contractId }).catch(() => null),
    apiQuery<ChangeRequest[] | null>('changeRequest.list', { contractId }).catch(() => null),
    apiQuery<Charter | null>('charter.get', { contractId }).catch(() => null),
  ])
  if (!contract) notFound()
  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/contractor/contracts" className="text-sm text-muted-foreground hover:text-foreground">← All contracts</Link>
        <div className="mt-4 space-y-5">
          <ContractDetail contract={contract} />
          {charter && <CharterPanel contractId={contract.id} initial={charter} />}
          <DefinitionOfDonePanel contractId={contract.id} role={contract.role} initial={contract.definitionOfDone} />
          <SprintPanel contractId={contract.id} rateType={contract.rateType} rateAmount={contract.rateAmount} initial={sprints ?? []} />
          <BlockerPanel contractId={contract.id} initial={blockers ?? []} />
          <ChangeRequestPanel contractId={contract.id} initial={changeRequests ?? []} />
          <StandupPanel contractId={contract.id} role={contract.role} initial={standups ?? []} requestedAt={contract.standupRequestedAt} cadence={contract.standupCadence} />
          <TimePanel contractId={contract.id} role={contract.role} rateType={contract.rateType} rateAmount={contract.rateAmount} active={contract.status === 'active'} initial={time ?? EMPTY_TIME} />
          <BillingPanel cycles={cycles ?? []} role={contract.role} />
          <ContractReviews reviews={reviews ?? []} role={contract.role} />
        </div>
      </main>
    </>
  )
}
