import { z } from 'zod'
import { router, vettedProcedure, adminProcedure, serviceProcedure } from '../../trpc/trpc'
import * as payments from './store'

/** Board provider surface — a Board-originated contract's billing cycles (what the client will be billed).
 *  Service-key + boardRef-scoped (never an unscoped collection). Read-only; charges stay platform-initiated. */
const providerRouter = router({
  cycles: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => payments.providerListCycles(input.contractRef)),
})

/** payments tRPC surface — the contractor's Connect onboarding + a contract's billing cycles + cycle disputes.
 *  The weekly sweep/charge runs on the worker; admins resolve disputes; Board reads via `payments.provider.*`. */
export const paymentsRouter = router({
  // contractor Connect (Express) onboarding
  payoutAccount: vettedProcedure.query(({ ctx }) => payments.myPayoutAccount(ctx.clerkUserId)),
  startOnboarding: vettedProcedure.mutation(({ ctx }) => payments.startOnboarding(ctx.clerkUserId)),
  // a contract's cycles (participant-gated: the contract's client or contractor)
  cycles: vettedProcedure.input(z.object({ contractId: z.string().uuid() })).query(({ ctx, input }) => payments.listCycles(ctx.clerkUserId, input.contractId)),
  // a participant contests a cycle (blocks its charge until an admin resolves)
  raiseDispute: vettedProcedure.input(z.object({ billingCycleId: z.string().uuid(), reason: z.string().min(1).max(2000) })).mutation(({ ctx, input }) => payments.raiseCycleDispute(ctx.clerkUserId, input.billingCycleId, input.reason)),
  // admin resolution
  resolveDispute: adminProcedure.input(z.object({ disputeId: z.string().uuid(), resolution: z.enum(['charge', 'void']), note: z.string().max(2000).optional() })).mutation(({ input }) => payments.resolveCycleDispute(input.disputeId, input.resolution, input.note)),
  // Board (client) read
  provider: providerRouter,
})
