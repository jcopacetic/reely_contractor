import { z } from 'zod'
import { router, vettedProcedure, adminProcedure, serviceProcedure } from '../../trpc/trpc'
import * as gov from './store'

const clientReason = z.enum(gov.CLIENT_REASONS)
const contractorReason = z.enum(gov.CONTRACTOR_REASONS)
const note = z.string().max(2000).optional()

/** Board provider seam — the client's standing for a contract (boardRef-scoped): is my contracting paused, or my
 *  contractor unavailable? */
const providerRouter = router({
  standing: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => gov.providerClientStanding(input.contractRef)),
})

/** governance tRPC surface — the owner's kill-switches (admin) + the affected party's own-standing read. */
export const governanceRouter = router({
  // admin kill-switches (the owner flips clients / contractors on/off with a reason)
  suspendClient: adminProcedure.input(z.object({ clientUserId: z.string().min(1), reason: clientReason, note })).mutation(({ ctx, input }) => gov.suspendClient(ctx.clerkUserId, input.clientUserId, input.reason, input.note ?? null, 'manual')),
  reinstateClient: adminProcedure.input(z.object({ clientUserId: z.string().min(1) })).mutation(({ ctx, input }) => gov.reinstateClient(ctx.clerkUserId, input.clientUserId)),
  suspendContractor: adminProcedure.input(z.object({ contractorUserId: z.string().min(1), reason: contractorReason, note })).mutation(({ ctx, input }) => gov.suspendContractor(ctx.clerkUserId, input.contractorUserId, input.reason, input.note ?? null)),
  reinstateContractor: adminProcedure.input(z.object({ contractorUserId: z.string().min(1) })).mutation(({ ctx, input }) => gov.reinstateContractor(ctx.clerkUserId, input.contractorUserId)),
  clientStandings: adminProcedure.query(() => gov.listClientStandings()),
  // the contractor's own standing (for the "you're suspended" banner)
  myStanding: vettedProcedure.query(({ ctx }) => gov.myContractorStanding(ctx.clerkUserId)),
  provider: providerRouter,
})
