import { z } from 'zod'
import { router, vettedProcedure, serviceProcedure } from '../../trpc/trpc'
import * as mp from './store'

const budgetType = z.enum(['hourly', 'fixed'])
const createListingInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  categoryIds: z.array(z.string().uuid()).max(12).default([]),
  budgetType,
  budgetAmount: z.number().positive().max(1_000_000).nullish(),
})
const submitBidInput = z.object({
  rateType: budgetType,
  amount: z.number().positive().max(1_000_000),
  hoursEstimate: z.number().positive().max(100_000).nullish(),
  message: z.string().max(2000).nullish(),
})

/**
 * Provider surface (Board → Contractor): service-key only, resource-scoped to Board-originated listings.
 * Board's client calls these as `/trpc/provider.*` (the manifest's `/provider/*`). createContract +
 * getTimeEntries arrive with the contracts/time modules.
 */
const providerRouter = router({
  createListing: serviceProcedure
    .input(createListingInput.extend({ ownerUserId: z.string().min(1), boardPartRef: z.string().min(1), invitedUserIds: z.array(z.string().min(1)).max(3).optional() }))
    .mutation(({ input }) => mp.providerCreateListing(input)),
  listBids: serviceProcedure.input(z.object({ listingRef: z.string().uuid() })).query(({ input }) => mp.providerListBids(input.listingRef)),
  counterBid: serviceProcedure.input(z.object({ bidRef: z.string().uuid() })).mutation(({ input }) => mp.counterBid(null, input.bidRef)),
  denyBid: serviceProcedure.input(z.object({ bidRef: z.string().uuid() })).mutation(({ input }) => mp.denyBid(null, input.bidRef)),
  acceptBid: serviceProcedure.input(z.object({ bidRef: z.string().uuid() })).mutation(({ input }) => mp.acceptBid(null, input.bidRef)),
  skillCategories: serviceProcedure.query(() => mp.providerSkillCategories()),
})

/** marketplace tRPC surface — native listing/bid ops (vetted contractors) + the Board provider sub-router. */
export const marketplaceRouter = router({
  // Listings
  createListing: vettedProcedure.input(createListingInput).mutation(({ ctx, input }) => mp.createListing(ctx.clerkUserId, input)),
  getListing: vettedProcedure.input(z.object({ listingId: z.string().uuid() })).query(({ ctx, input }) => mp.getListing(ctx.clerkUserId, input.listingId)),
  listMine: vettedProcedure.query(({ ctx }) => mp.listMine(ctx.clerkUserId)),
  closeListing: vettedProcedure.input(z.object({ listingId: z.string().uuid() })).mutation(({ ctx, input }) => mp.closeListing(ctx.clerkUserId, input.listingId)),
  // Bids — bidder
  submitBid: vettedProcedure.input(z.object({ listingId: z.string().uuid() }).merge(submitBidInput)).mutation(({ ctx, input }) => {
    const { listingId, ...bid } = input
    return mp.submitBid(ctx.clerkUserId, listingId, bid)
  }),
  withdrawBid: vettedProcedure.input(z.object({ bidId: z.string().uuid() })).mutation(({ ctx, input }) => mp.withdrawBid(ctx.clerkUserId, input.bidId)),
  myBids: vettedProcedure.query(({ ctx }) => mp.myBids(ctx.clerkUserId)),
  // Bids — listing owner
  getBidsForListing: vettedProcedure.input(z.object({ listingId: z.string().uuid() })).query(({ ctx, input }) => mp.getBidsForListing(ctx.clerkUserId, input.listingId)),
  counterBid: vettedProcedure.input(z.object({ bidId: z.string().uuid() })).mutation(({ ctx, input }) => mp.counterBid(ctx.clerkUserId, input.bidId)),
  denyBid: vettedProcedure.input(z.object({ bidId: z.string().uuid() })).mutation(({ ctx, input }) => mp.denyBid(ctx.clerkUserId, input.bidId)),
  acceptBid: vettedProcedure.input(z.object({ bidId: z.string().uuid() })).mutation(({ ctx, input }) => mp.acceptBid(ctx.clerkUserId, input.bidId)),
  // Provider (Board)
  provider: providerRouter,
})
