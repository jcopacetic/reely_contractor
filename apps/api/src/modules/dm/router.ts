import { z } from 'zod'
import { router, vettedProcedure } from '../../trpc/trpc'
import * as dm from './store'

/** dm tRPC surface — 1:1 social DMs (vetted contractors only; every op is participant-gated in the store). */
export const dmRouter = router({
  threads: vettedProcedure.query(({ ctx }) => dm.listThreads(ctx.clerkUserId)),
  open: vettedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(({ ctx, input }) => dm.openThread(ctx.clerkUserId, input.userId)),
  messages: vettedProcedure
    .input(z.object({ threadId: z.string().uuid(), before: z.string().optional() }))
    .query(({ ctx, input }) => dm.listMessages(ctx.clerkUserId, input.threadId, 50, input.before)),
  send: vettedProcedure
    .input(z.object({ threadId: z.string().uuid(), body: z.string().min(1).max(4000) }))
    .mutation(({ ctx, input }) => dm.sendMessage(ctx.clerkUserId, input.threadId, input.body)),
  unreadCount: vettedProcedure.query(({ ctx }) => dm.unreadCount(ctx.clerkUserId)),
})
