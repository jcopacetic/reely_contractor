import { z } from 'zod'
import { router, vettedProcedure, serviceProcedure } from '../../trpc/trpc'
import * as standup from './store'

/** Board provider seam — the client reads stand-ups + requests one + sets a cadence (boardRef-scoped). */
const providerRouter = router({
  list: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => standup.providerList(input.contractRef)),
  request: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).mutation(({ input }) => standup.providerRequest(input.contractRef)),
  setCadence: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), cadence: z.string().max(40) })).mutation(({ input }) => standup.providerSetCadence(input.contractRef, input.cadence)),
})

/** standup tRPC surface — post + list stand-ups on a contract (vetted contractor participant) + the Board provider
 *  read. The client-request + cadence loop lands later (needs a request state + notifications). */
export const standupRouter = router({
  post: vettedProcedure
    .input(z.object({ contractId: z.string().uuid(), done: z.string().min(1).max(2000), next: z.string().min(1).max(2000), blockers: z.string().max(2000).optional() }))
    .mutation(({ ctx, input }) => standup.post(ctx.clerkUserId, input.contractId, input)),
  list: vettedProcedure.input(z.object({ contractId: z.string().uuid() })).query(({ ctx, input }) => standup.list(ctx.clerkUserId, input.contractId)),
  provider: providerRouter,
})
