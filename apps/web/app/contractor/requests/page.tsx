import { apiQuery } from '@/lib/api'
import { HireRequestsList, HireRequestsHeader, type HireRequest } from '@/components/hire-requests-list'

export const dynamic = 'force-dynamic'

export default async function HireRequestsPage() {
  const items = await apiQuery<HireRequest[]>('hire.list', {}).catch(() => [] as HireRequest[])
  const newCount = items.filter((r) => r.status === 'new').length
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <HireRequestsHeader count={newCount} />
      <p className="mb-5 text-sm text-muted-foreground">Leads from your public profile. Reply by email, then mark them handled.</p>
      <HireRequestsList initial={items} />
    </main>
  )
}
