import { z } from 'zod'
import { router, vettedProcedure } from '../../trpc/trpc'
import * as standup from './store'

/** standup tRPC surface — post + list stand-ups on a contract. Vetted contractors (a participant); the client
 *  side (request + view from Board) lands as a provider surface in a later task. */
export const standupRouter = router({
  post: vettedProcedure
    .input(z.object({ contractId: z.string().uuid(), done: z.string().min(1).max(2000), next: z.string().min(1).max(2000), blockers: z.string().max(2000).optional() }))
    .mutation(({ ctx, input }) => standup.post(ctx.clerkUserId, input.contractId, input)),
  list: vettedProcedure.input(z.object({ contractId: z.string().uuid() })).query(({ ctx, input }) => standup.list(ctx.clerkUserId, input.contractId)),
})
