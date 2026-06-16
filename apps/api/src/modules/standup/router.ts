import { z } from 'zod'
import { router, vettedProcedure, serviceProcedure } from '../../trpc/trpc'
import * as standup from './store'

/** Board provider seam — the client reads a Board-originated contract's stand-ups (read-only, boardRef-scoped). */
const providerRouter = router({
  list: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => standup.providerList(input.contractRef)),
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
