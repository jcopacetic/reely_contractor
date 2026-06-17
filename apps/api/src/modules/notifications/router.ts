import { z } from 'zod'
import { router, vettedProcedure, serviceProcedure } from '../../trpc/trpc'
import * as notifications from './store'
import { verifyUnsub, setUnsubscribed } from '../../notifications-email'

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
  prefs: vettedProcedure.query(({ ctx }) => notifications.getPrefs(ctx.clerkUserId)),
  setPref: vettedProcedure
    .input(z.object({ category: z.string().min(1).max(32), channel: z.enum(['inApp', 'email']), on: z.boolean() }))
    .mutation(({ ctx, input }) => notifications.setCategoryPref(ctx.clerkUserId, input.category, input.channel, input.on)),
  setEmail: vettedProcedure.input(z.object({ unsubscribed: z.boolean() })).mutation(({ ctx, input }) => notifications.setEmailUnsubscribed(ctx.clerkUserId, input.unsubscribed)),
  // One-click unsubscribe from digest emails — token-verified (no login), called by the web unsubscribe page.
  unsubscribe: serviceProcedure.input(z.object({ userId: z.string().min(1), token: z.string().min(1) })).mutation(async ({ input }) => {
    if (!verifyUnsub(input.userId, input.token)) return { ok: false as const }
    await setUnsubscribed(input.userId)
    return { ok: true as const }
  }),
  provider: providerRouter,
})
