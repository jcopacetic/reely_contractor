import { z } from 'zod'
import { router, sessionProcedure, adminProcedure } from '../../trpc/trpc'
import * as identity from './store'

/** contractor-identity tRPC surface. apply/redeem/get-status = any signed-in user; the rest = platform_admin. */
export const identityRouter = router({
  // NB: 'apply' is a tRPC-reserved procedure name (collides with Function.prototype.apply) — use 'submit'.
  submit: sessionProcedure.mutation(({ ctx }) => identity.apply(ctx.clerkUserId)),
  redeemInvite: sessionProcedure
    .input(z.object({ code: z.string().min(1) }))
    .mutation(({ ctx, input }) => identity.redeemInvite(ctx.clerkUserId, input.code)),
  getStatus: sessionProcedure.query(({ ctx }) => identity.getStatus(ctx.clerkUserId)),

  createInvite: adminProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(({ ctx, input }) => identity.createInvite(ctx.clerkUserId, input.email)),
  review: adminProcedure
    .input(z.object({ applicationId: z.string().uuid() }))
    .mutation(({ ctx, input }) => identity.review(ctx.clerkUserId, input.applicationId)),
  approve: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(({ ctx, input }) => identity.approve(ctx.clerkUserId, input.userId)),
  reject: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(({ ctx, input }) => identity.reject(ctx.clerkUserId, input.userId)),
  suspend: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(({ ctx, input }) => identity.suspend(ctx.clerkUserId, input.userId)),
  reinstate: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(({ ctx, input }) => identity.reinstate(ctx.clerkUserId, input.userId)),
  vettingQueue: adminProcedure.query(() => identity.vettingQueue()),
})
