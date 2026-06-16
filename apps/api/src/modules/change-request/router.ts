import { z } from 'zod'
import { router, vettedProcedure, serviceProcedure } from '../../trpc/trpc'
import * as cr from './store'

const crInput = z.object({
  kind: z.enum(['scope', 'rate', 'timeline', 'other']),
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(4000),
  proposedRateType: z.enum(['hourly', 'fixed']).nullish(),
  proposedRateAmount: z.number().positive().max(1_000_000).nullish(),
})

/** Board provider seam — the client negotiates change-requests (acts as the client; boardRef-scoped). */
const providerRouter = router({
  list: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => cr.providerList(input.contractRef)),
  propose: serviceProcedure.input(z.object({ contractRef: z.string().uuid() }).and(crInput)).mutation(({ input }) => cr.providerPropose(input.contractRef, input)),
  edit: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), changeRequestId: z.string().uuid() }).and(crInput)).mutation(({ input }) => cr.providerEdit(input.contractRef, input.changeRequestId, input)),
  approve: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), changeRequestId: z.string().uuid() })).mutation(({ input }) => cr.providerApprove(input.contractRef, input.changeRequestId)),
  withdraw: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), changeRequestId: z.string().uuid() })).mutation(({ input }) => cr.providerWithdraw(input.contractRef, input.changeRequestId)),
})

/** change-request tRPC surface — propose / counter-edit / approve / withdraw + list (vetted participant) + the
 *  Board provider (the client side). The role is derived from the contract / provider seam either way. */
export const changeRequestRouter = router({
  list: vettedProcedure.input(z.object({ contractId: z.string().uuid() })).query(({ ctx, input }) => cr.list(ctx.clerkUserId, input.contractId)),
  propose: vettedProcedure.input(z.object({ contractId: z.string().uuid() }).and(crInput)).mutation(({ ctx, input }) => cr.propose(ctx.clerkUserId, input.contractId, input)),
  edit: vettedProcedure.input(z.object({ changeRequestId: z.string().uuid() }).and(crInput)).mutation(({ ctx, input }) => cr.edit(ctx.clerkUserId, input.changeRequestId, input)),
  approve: vettedProcedure.input(z.object({ changeRequestId: z.string().uuid() })).mutation(({ ctx, input }) => cr.approve(ctx.clerkUserId, input.changeRequestId)),
  withdraw: vettedProcedure.input(z.object({ changeRequestId: z.string().uuid() })).mutation(({ ctx, input }) => cr.withdraw(ctx.clerkUserId, input.changeRequestId)),
  provider: providerRouter,
})
