import { apiQuery } from '@/lib/api'
import { PayoutsPanel, type PayoutAccount } from '@/components/payouts-panel'
import { BillingDashboard, type BillingWeek } from '@/components/billing-dashboard'
import { StatsPanel, type PartyStats } from '@/components/stats-panel'
import { TransactionsPanel, type LedgerRow } from '@/components/transactions-panel'
import { TaxLegalPanel } from '@/components/tax-legal-panel'

export const dynamic = 'force-dynamic'

const EMPTY_STATS: PartyStats = { contracts: { total: 0, active: 0, completed: 0, cancelled: 0, other: 0 }, successRate: null, money: { total: 0, currency: 'usd', monthly: [] } }

export default async function PayoutsPage() {
  const [account, weeks, stats, transactions] = await Promise.all([
    apiQuery<PayoutAccount>('payments.payoutAccount').catch(() => ({ connected: false, configured: false }) as PayoutAccount),
    apiQuery<BillingWeek[]>('payments.dashboard').catch(() => [] as BillingWeek[]),
    apiQuery<PartyStats>('payments.stats').catch(() => EMPTY_STATS),
    apiQuery<LedgerRow[]>('payments.ledger').catch(() => [] as LedgerRow[]),
  ])
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <PayoutsPanel account={account} />
      <StatsPanel stats={stats ?? EMPTY_STATS} side="contractor" />
      <BillingDashboard weeks={weeks ?? []} side="contractor" />
      <TransactionsPanel rows={transactions ?? []} side="contractor" exportBase="/contractor/payouts/export" />
      <TaxLegalPanel connected={account?.connected ?? false} />
    </main>
  )
}
