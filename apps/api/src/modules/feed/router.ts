import { z } from 'zod'
import { router, vettedProcedure } from '../../trpc/trpc'
import * as feed from './store'

/** feed tRPC surface — vetted contractors only (the club). */
export const feedRouter = router({
  createPost: vettedProcedure
    .input(z.object({ body: z.string().min(1).max(5000), kind: z.enum(['update', 'milestone', 'achievement']).optional() }))
    .mutation(({ ctx, input }) => feed.createPost(ctx.clerkUserId, input.body, input.kind)),
  list: vettedProcedure
    .input(z.object({ before: z.string().optional() }).optional())
    .query(({ ctx, input }) => feed.listFeed(ctx.clerkUserId, 30, input?.before)),
  react: vettedProcedure
    .input(z.object({ postId: z.string().uuid(), type: z.enum(['like', 'celebrate', 'insightful', 'fire', 'support']) }))
    .mutation(({ ctx, input }) => feed.react(ctx.clerkUserId, input.postId, input.type)),
})
