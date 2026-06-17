import { apiQuery } from '@/lib/api'
import { PayoutsPanel, type PayoutAccount } from '@/components/payouts-panel'
import { BillingDashboard, type BillingWeek } from '@/components/billing-dashboard'

export const dynamic = 'force-dynamic'

export default async function PayoutsPage() {
  const [account, weeks] = await Promise.all([
    apiQuery<PayoutAccount>('payments.payoutAccount').catch(() => ({ connected: false, configured: false }) as PayoutAccount),
    apiQuery<BillingWeek[]>('payments.dashboard').catch(() => [] as BillingWeek[]),
  ])
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <PayoutsPanel account={account} />
      <BillingDashboard weeks={weeks ?? []} side="contractor" />
    </main>
  )
}
