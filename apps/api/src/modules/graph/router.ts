import { z } from 'zod'
import { router, vettedProcedure } from '../../trpc/trpc'
import * as graph from './store'

/** graph tRPC surface — follows + the in-club profile view (vetted contractors only). */
export const graphRouter = router({
  toggleFollow: vettedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(({ ctx, input }) => graph.toggleFollow(ctx.clerkUserId, input.userId)),
  profile: vettedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(({ ctx, input }) => graph.getClubProfile(ctx.clerkUserId, input.userId)),
})
