import { z } from 'zod'
import { router, vettedProcedure } from '../../trpc/trpc'
import * as feed from './store'

/** job-feed tRPC surface — vetted-only, read-only browse over open listings (bid actions live in marketplace). */
export const jobFeedRouter = router({
  list: vettedProcedure
    .input(
      z
        .object({
          categoryIds: z.array(z.string().uuid()).max(20).optional(),
          budgetType: z.enum(['hourly', 'fixed']).optional(),
          before: z.string().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => feed.listListings(ctx.clerkUserId, input ?? {})),
  get: vettedProcedure.input(z.object({ listingId: z.string().uuid() })).query(({ ctx, input }) => feed.getFeedListing(ctx.clerkUserId, input.listingId)),
  myCategories: vettedProcedure.query(({ ctx }) => feed.viewerCategories(ctx.clerkUserId)),
})
