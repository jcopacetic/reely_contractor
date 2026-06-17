import { z } from 'zod'
import { router, vettedProcedure, publicProcedure } from '../../trpc/trpc'
import * as hire from './store'

/** hire tRPC surface. `request` is anonymous (the public profile's hire box); list/handle are the owner's inbox. */
export const hireRouter = router({
  request: publicProcedure
    .input(z.object({
      slug: z.string().min(1).max(40),
      fromName: z.string().min(1).max(80),
      fromEmail: z.string().email().max(160),
      message: z.string().min(1).max(2000),
      projectType: z.string().max(120).nullish(),
      budget: z.string().max(120).nullish(),
    }))
    .mutation(({ input }) => hire.requestHire(input.slug, input)),
  list: vettedProcedure.query(({ ctx }) => hire.listHireRequests(ctx.clerkUserId)),
  newCount: vettedProcedure.query(({ ctx }) => hire.newHireRequestCount(ctx.clerkUserId)),
  setStatus: vettedProcedure
    .input(z.object({ id: z.string().uuid(), status: z.enum(['new', 'handled', 'archived']) }))
    .mutation(({ ctx, input }) => hire.setHireRequestStatus(ctx.clerkUserId, input.id, input.status)),
})
