import { z } from 'zod'
import { router, vettedProcedure, serviceProcedure } from '../../trpc/trpc'
import * as blocker from './store'

const reason = z.string().min(1).max(2000)
const note = z.string().max(2000)

/** Board provider seam — the client raises / resolves / reads blockers (acts as the client; boardRef-scoped). */
const providerRouter = router({
  list: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => blocker.providerList(input.contractRef)),
  raise: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), reason })).mutation(({ input }) => blocker.providerRaise(input.contractRef, input.reason)),
  resolve: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), blockerId: z.string().uuid(), note })).mutation(({ input }) => blocker.providerResolve(input.contractRef, input.blockerId, input.note)),
})

/** blocker tRPC surface — raise / resolve / list blockers on a contract (vetted participant) + the Board provider
 *  (the client side). The role is derived from the contract / provider seam either way. */
export const blockerRouter = router({
  list: vettedProcedure.input(z.object({ contractId: z.string().uuid() })).query(({ ctx, input }) => blocker.list(ctx.clerkUserId, input.contractId)),
  raise: vettedProcedure.input(z.object({ contractId: z.string().uuid(), reason, sprintId: z.string().uuid().optional() })).mutation(({ ctx, input }) => blocker.raise(ctx.clerkUserId, input.contractId, { reason: input.reason, sprintId: input.sprintId })),
  resolve: vettedProcedure.input(z.object({ blockerId: z.string().uuid(), note })).mutation(({ ctx, input }) => blocker.resolve(ctx.clerkUserId, input.blockerId, input.note)),
  provider: providerRouter,
})
