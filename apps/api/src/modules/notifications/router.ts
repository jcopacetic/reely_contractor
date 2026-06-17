import { z } from 'zod'
import { router, vettedProcedure, serviceProcedure } from '../../trpc/trpc'
import * as notifications from './store'

/** Board provider seam — the client's notifications for a contract (boardRef-scoped). */
const providerRouter = router({
  listForContract: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => notifications.providerListForContract(input.contractRef)),
  markAllReadForContract: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).mutation(({ input }) => notifications.providerMarkAllReadForContract(input.contractRef)),
})

/** notifications tRPC surface — the in-app bell (the viewer reads/marks their own) + the Board provider. */
export const notificationsRouter = router({
  list: vettedProcedure.query(({ ctx }) => notifications.list(ctx.clerkUserId)),
  unreadCount: vettedProcedure.query(({ ctx }) => notifications.unreadCount(ctx.clerkUserId)),
  markRead: vettedProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ ctx, input }) => notifications.markRead(ctx.clerkUserId, input.id)),
  markAllRead: vettedProcedure.mutation(({ ctx }) => notifications.markAllRead(ctx.clerkUserId)),
  provider: providerRouter,
})
