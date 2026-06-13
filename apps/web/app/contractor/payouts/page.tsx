import { apiQuery } from '@/lib/api'
import { PayoutsPanel, type PayoutAccount } from '@/components/payouts-panel'

export const dynamic = 'force-dynamic'

export default async function PayoutsPage() {
  const account = await apiQuery<PayoutAccount>('payments.payoutAccount').catch(
    () => ({ connected: false, configured: false }) as PayoutAccount,
  )
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <PayoutsPanel account={account} />
    </main>
  )
}
