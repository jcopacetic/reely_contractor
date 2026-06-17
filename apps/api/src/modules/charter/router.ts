import { z } from 'zod'
import { router, vettedProcedure, serviceProcedure } from '../../trpc/trpc'
import * as charter from './store'

const doc = z.object({ goals: z.string().max(4000).nullish(), workingAgreement: z.string().max(4000).nullish(), successCriteria: z.string().max(4000).nullish() })
const note = z.string().max(4000)

/** Board provider seam — the client reads/edits/acknowledges/closes the charter (acts as the client; boardRef-scoped). */
const providerRouter = router({
  get: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => charter.providerGet(input.contractRef)),
  save: serviceProcedure.input(z.object({ contractRef: z.string().uuid() }).and(doc)).mutation(({ input }) => charter.providerSave(input.contractRef, input)),
  acknowledge: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).mutation(({ input }) => charter.providerAcknowledge(input.contractRef)),
  closeOut: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), note })).mutation(({ input }) => charter.providerCloseOut(input.contractRef, input.note)),
})

/** charter tRPC surface — get / save / acknowledge / close-out (vetted participant) + the Board provider (the
 *  client side). The charter is a singleton per contract; the role is derived from the contract / provider seam. */
export const charterRouter = router({
  get: vettedProcedure.input(z.object({ contractId: z.string().uuid() })).query(({ ctx, input }) => charter.get(ctx.clerkUserId, input.contractId)),
  save: vettedProcedure.input(z.object({ contractId: z.string().uuid() }).and(doc)).mutation(({ ctx, input }) => charter.save(ctx.clerkUserId, input.contractId, input)),
  acknowledge: vettedProcedure.input(z.object({ contractId: z.string().uuid() })).mutation(({ ctx, input }) => charter.acknowledge(ctx.clerkUserId, input.contractId)),
  closeOut: vettedProcedure.input(z.object({ contractId: z.string().uuid(), note })).mutation(({ ctx, input }) => charter.closeOut(ctx.clerkUserId, input.contractId, input.note)),
  provider: providerRouter,
})
