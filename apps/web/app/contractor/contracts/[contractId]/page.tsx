import Link from 'next/link'
import { notFound } from 'next/navigation'
import { apiQuery } from '@/lib/api'
import { ContractorHeader } from '@/components/contractor-header'
import { ContractDetail } from '@/components/contract-detail'

export const dynamic = 'force-dynamic'

type Item = { id: string; kind: 'milestone' | 'scope_add' | 'deliverable' | 'note'; title: string; description: string | null; amount: number | null; status: string; order: number }
type Contract = {
  id: string; title: string; listingTitle: string | null; boardRef: string | null
  clientUserId: string; contractorUserId: string; rateType: 'hourly' | 'fixed'; rateAmount: number
  status: string; role: 'client' | 'contractor'; startedAt: string; endedAt: string | null; items: Item[]
}

export default async function ContractDetailPage({ params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params
  const contract = await apiQuery<Contract | null>('contracts.get', { contractId }).catch(() => null)
  if (!contract) notFound()
  return (
    <>
      <ContractorHeader active="contracts" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/contractor/contracts" className="text-sm text-muted-foreground hover:text-foreground">← All contracts</Link>
        <div className="mt-4">
          <ContractDetail contract={contract} />
        </div>
      </main>
    </>
  )
}
