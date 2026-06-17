import { z } from 'zod'
import { router, vettedProcedure, adminProcedure } from '../../trpc/trpc'
import * as skills from './store'

/** skills tRPC surface — a vetted contractor requests a missing skill; an admin moderates the queue. */
export const skillsRouter = router({
  request: vettedProcedure.input(z.object({ name: z.string().min(1).max(60) })).mutation(({ ctx, input }) => skills.requestSkill(ctx.clerkUserId, input.name)),
  pending: adminProcedure.query(() => skills.pendingSkillRequests()),
  approve: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ input }) => skills.approveSkill(input.id)),
  reject: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ input }) => skills.rejectSkill(input.id)),
})
