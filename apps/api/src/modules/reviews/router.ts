import { z } from 'zod'
import { router, sessionProcedure, vettedProcedure, serviceProcedure } from '../../trpc/trpc'
import * as reviews from './store'

const star = z.number().int().min(1).max(5)
const pulse = z.enum(['up', 'neutral', 'down'])
const kudos = z.array(z.string().max(40)).max(8).optional() // store whitelists against the canonical set
const dimensions = z.object({ communication: star, quality: star, timeliness: star, collaboration: star })

// Weekly = a pulse + optional kudos + an optional one-liner. Final = dimension stars + kudos + a comment.
const weeklyInput = z.object({ contractId: z.string().uuid(), pulse, kudos, body: z.string().max(280).optional() })
const finalInput = z.object({ contractId: z.string().uuid(), dimensions, kudos, body: z.string().min(1).max(2000) })
const providerWeekly = z.object({ contractRef: z.string().uuid(), pulse, kudos, body: z.string().max(280).optional(), authorLabel: z.string().max(120).nullish() })
const providerFinal = z.object({ contractRef: z.string().uuid(), dimensions, kudos, body: z.string().min(1).max(2000), authorLabel: z.string().max(120).nullish() })

/** Board provider seam — a Board client submits/lists reviews on a Board-originated contract (boardRef-scoped). */
const providerRouter = router({
  createWeekly: serviceProcedure.input(providerWeekly).mutation(({ input }) => reviews.providerCreateWeekly(input.contractRef, input, input.authorLabel)),
  createFinal: serviceProcedure.input(providerFinal).mutation(({ input }) => reviews.providerCreateFinal(input.contractRef, input, input.authorLabel)),
  list: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => reviews.providerList(input.contractRef)),
})

/**
 * reviews tRPC surface — the client reviews the contractor (native client = a signed-in participant; Board client
 * = the provider). Weekly reviews are the contractor's to approve-for-display; the final is always public.
 */
export const reviewsRouter = router({
  // native client (the contract's client) — weekly while active, final at close
  createWeekly: sessionProcedure.input(weeklyInput).mutation(({ ctx, input }) => reviews.clientCreateWeekly(ctx.clerkUserId, input.contractId, input)),
  createFinal: sessionProcedure.input(finalInput).mutation(({ ctx, input }) => reviews.clientCreateFinal(ctx.clerkUserId, input.contractId, input)),
  // a contract's reviews for a participant (drives the contractor's manage view + a client's own list)
  list: sessionProcedure.input(z.object({ contractId: z.string().uuid() })).query(({ ctx, input }) => reviews.listForViewer(ctx.clerkUserId, input.contractId)),
  // the contractor approves/hides a weekly review (finals can't be hidden)
  toggleApproval: vettedProcedure.input(z.object({ reviewId: z.string().uuid() })).mutation(({ ctx, input }) => reviews.toggleApproval(ctx.clerkUserId, input.reviewId)),
  provider: providerRouter,
})
