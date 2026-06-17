import { z } from 'zod'
import { router, vettedProcedure, adminProcedure, serviceProcedure } from '../../trpc/trpc'
import { enqueue } from '../../queue'
import * as payments from './store'
import * as ledger from './ledger'
import * as dashboard from './dashboard'
import * as disputes from './disputes'

/** Board provider surface — a Board-originated contract's billing cycles (what the client will be billed).
 *  Service-key + boardRef-scoped (never an unscoped collection). Read-only; charges stay platform-initiated. */
const providerRouter = router({
  cycles: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => payments.providerListCycles(input.contractRef)),
  // Client card-on-file: Board collects/saves the client's card against this SetupIntent, then reads status.
  setupIntent: serviceProcedure
    .input(z.object({ clientUserId: z.string().min(1), email: z.string().email().optional() }))
    .mutation(({ input }) => payments.ensureClientSetupIntent(input.clientUserId, input.email)),
  // Hosted card collection — returns a Stripe Checkout (setup-mode) URL for the client to enter a card on.
  setupCheckout: serviceProcedure
    .input(z.object({ clientUserId: z.string().min(1), email: z.string().email().optional(), returnUrl: z.string().url() }))
    .mutation(({ input }) => payments.ensureClientSetupCheckout(input.clientUserId, input.email, input.returnUrl)),
  billingStatus: serviceProcedure.input(z.object({ clientUserId: z.string().min(1) })).query(({ input }) => payments.clientBillingStatus(input.clientUserId)),
  // The client's immutable transaction record for a contract (boardRef-scoped).
  ledger: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => ledger.providerLedgerForContract(input.contractRef)),
  // The client's weekly billing dashboard across the workspace's contracts (each boardRef-scoped).
  dashboard: serviceProcedure.input(z.object({ contractRefs: z.array(z.string().uuid()).max(200) })).query(({ input }) => dashboard.providerBillingDashboard(input.contractRefs)),
})

/** payments tRPC surface — the contractor's Connect onboarding + a contract's billing cycles + cycle disputes.
 *  The weekly sweep/charge runs on the worker; admins resolve disputes; Board reads via `payments.provider.*`. */
export const paymentsRouter = router({
  // contractor Connect (Express) onboarding
  payoutAccount: vettedProcedure.query(({ ctx }) => payments.myPayoutAccount(ctx.clerkUserId)),
  startOnboarding: vettedProcedure.mutation(({ ctx }) => payments.startOnboarding(ctx.clerkUserId)),
  // a contract's cycles (participant-gated: the contract's client or contractor)
  cycles: vettedProcedure.input(z.object({ contractId: z.string().uuid() })).query(({ ctx, input }) => payments.listCycles(ctx.clerkUserId, input.contractId)),
  // the contractor's own immutable transaction record (what they've earned across contracts)
  ledger: vettedProcedure.query(({ ctx }) => ledger.ledgerForContractor(ctx.clerkUserId)),
  // the contractor's weekly billing dashboard (in progress / in review / paid, by week)
  dashboard: vettedProcedure.query(({ ctx }) => dashboard.contractorBillingDashboard(ctx.clerkUserId)),
  // a participant contests a cycle (blocks its charge until an admin resolves)
  raiseDispute: vettedProcedure.input(z.object({ billingCycleId: z.string().uuid(), reason: z.string().min(1).max(2000) })).mutation(({ ctx, input }) => payments.raiseCycleDispute(ctx.clerkUserId, input.billingCycleId, input.reason)),
  // admin: the dispute area — open disputes with full adjudication context (parties, amount, reason, card)
  disputeQueue: adminProcedure.query(() => disputes.disputeQueue()),
  // admin resolution
  resolveDispute: adminProcedure.input(z.object({ disputeId: z.string().uuid(), resolution: z.enum(['charge', 'void']), note: z.string().max(2000).optional() })).mutation(({ input }) => payments.resolveCycleDispute(input.disputeId, input.resolution, input.note)),
  // admin: fire the weekly billing tick on demand (testing + ops). Enqueues the SAME job the Sunday cron does;
  // the worker runs the sweep→charge. Idempotent per period, so running it repeatedly is safe.
  runBillingCycle: adminProcedure.mutation(async () => {
    await enqueue('payments.billing-cycle', {})
    return { ok: true as const }
  }),
  // Board (client) read
  provider: providerRouter,
})
