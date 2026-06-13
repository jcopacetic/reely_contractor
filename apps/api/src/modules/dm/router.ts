import { z } from 'zod'
import { router, vettedProcedure, serviceProcedure } from '../../trpc/trpc'
import * as dm from './store'

/** Provider surface (Board): tenant↔contractor hire/team chat. Service-key; every op is scoped to the room's
 *  tenant participant matching the passed `tenantRef` (Board vouches the acting member belongs to that tenant). */
const providerRouter = router({
  openHireRoom: serviceProcedure
    .input(z.object({ tenantRef: z.string().min(1), orgLabel: z.string().min(1).max(120), contractorUserId: z.string().min(1), boardRef: z.string().nullish() }))
    .mutation(({ input }) => dm.providerOpenHireRoom(input)),
  openTeamRoom: serviceProcedure
    .input(z.object({ tenantRef: z.string().min(1), orgLabel: z.string().min(1).max(120), contractorUserIds: z.array(z.string().min(1)).min(1).max(20), boardRef: z.string().nullish(), title: z.string().max(120).nullish() }))
    .mutation(({ input }) => dm.providerOpenTeamRoom(input)),
  addParticipant: serviceProcedure
    .input(z.object({ tenantRef: z.string().min(1), roomId: z.string().uuid(), contractorUserId: z.string().min(1) }))
    .mutation(({ input }) => dm.providerAddParticipant(input)),
  listRooms: serviceProcedure.input(z.object({ tenantRef: z.string().min(1), userId: z.string().min(1) })).query(({ input }) => dm.providerListRooms(input.tenantRef, input.userId)),
  listMessages: serviceProcedure
    .input(z.object({ tenantRef: z.string().min(1), roomId: z.string().uuid(), userId: z.string().min(1), before: z.string().optional() }))
    .query(({ input }) => dm.providerListMessages(input.tenantRef, input.roomId, input.userId, input.before)),
  send: serviceProcedure
    .input(z.object({ tenantRef: z.string().min(1), roomId: z.string().uuid(), senderUserId: z.string().min(1), senderLabel: z.string().max(120), body: z.string().min(1).max(4000) }))
    .mutation(({ input }) => dm.providerSend(input)),
  markRead: serviceProcedure.input(z.object({ tenantRef: z.string().min(1), roomId: z.string().uuid(), userId: z.string().min(1) })).mutation(({ input }) => dm.providerMarkRead(input.tenantRef, input.roomId, input.userId)),
})

/** dm tRPC surface — chat rooms. Native ops = vetted contractor participants; the Board provider = service-key. */
export const dmRouter = router({
  rooms: vettedProcedure.query(({ ctx }) => dm.listRooms(ctx.clerkUserId)),
  open: vettedProcedure.input(z.object({ userId: z.string().min(1) })).mutation(({ ctx, input }) => dm.openDirect(ctx.clerkUserId, input.userId)),
  messages: vettedProcedure
    .input(z.object({ roomId: z.string().uuid(), before: z.string().optional() }))
    .query(({ ctx, input }) => dm.listMessages(ctx.clerkUserId, input.roomId, 50, input.before)),
  send: vettedProcedure
    .input(z.object({ roomId: z.string().uuid(), body: z.string().min(1).max(4000) }))
    .mutation(({ ctx, input }) => dm.send(ctx.clerkUserId, input.roomId, input.body)),
  markRead: vettedProcedure.input(z.object({ roomId: z.string().uuid() })).mutation(({ ctx, input }) => dm.markRead(ctx.clerkUserId, input.roomId)),
  unreadCount: vettedProcedure.query(({ ctx }) => dm.unreadCount(ctx.clerkUserId)),
  provider: providerRouter,
})
