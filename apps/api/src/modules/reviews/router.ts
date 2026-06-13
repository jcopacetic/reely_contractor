import { z } from 'zod'
import { router, sessionProcedure, vettedProcedure, serviceProcedure } from '../../trpc/trpc'
import * as reviews from './store'

const ratingInput = z.object({ contractId: z.string().uuid(), rating: z.number().int().min(1).max(5), body: z.string().min(1).max(2000) })
const providerInput = z.object({ contractRef: z.string().uuid(), rating: z.number().int().min(1).max(5), body: z.string().min(1).max(2000), authorLabel: z.string().max(120).nullish() })

/** Board provider seam — a Board client submits/lists reviews on a Board-originated contract (boardRef-scoped). */
const providerRouter = router({
  createWeekly: serviceProcedure.input(providerInput).mutation(({ input }) => reviews.providerCreateWeekly(input.contractRef, input.rating, input.body, input.authorLabel)),
  createFinal: serviceProcedure.input(providerInput).mutation(({ input }) => reviews.providerCreateFinal(input.contractRef, input.rating, input.body, input.authorLabel)),
  list: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => reviews.providerList(input.contractRef)),
})

/**
 * reviews tRPC surface — the client reviews the contractor (native client = a signed-in participant; Board client
 * = the provider). Weekly reviews are the contractor's to approve-for-display; the final is always public.
 */
export const reviewsRouter = router({
  // native client (the contract's client) — weekly while active, final at close
  createWeekly: sessionProcedure.input(ratingInput).mutation(({ ctx, input }) => reviews.clientCreateWeekly(ctx.clerkUserId, input.contractId, input.rating, input.body)),
  createFinal: sessionProcedure.input(ratingInput).mutation(({ ctx, input }) => reviews.clientCreateFinal(ctx.clerkUserId, input.contractId, input.rating, input.body)),
  // a contract's reviews for a participant (drives the contractor's manage view + a client's own list)
  list: sessionProcedure.input(z.object({ contractId: z.string().uuid() })).query(({ ctx, input }) => reviews.listForViewer(ctx.clerkUserId, input.contractId)),
  // the contractor approves/hides a weekly review (finals can't be hidden)
  toggleApproval: vettedProcedure.input(z.object({ reviewId: z.string().uuid() })).mutation(({ ctx, input }) => reviews.toggleApproval(ctx.clerkUserId, input.reviewId)),
  provider: providerRouter,
})
