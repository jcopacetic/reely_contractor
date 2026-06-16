import { z } from 'zod'
import { router, vettedProcedure } from '../../trpc/trpc'
import * as sprint from './store'

const itemsInput = z.array(z.object({ title: z.string().min(1).max(200), effortPoints: z.number().int().min(0).max(1000) })).min(1).max(50)
const ttd = z.number().int().min(1).max(365)

/** sprint tRPC surface — propose / counter-edit / approve / cancel + list (vetted contractor participant). The
 *  client side (Board provider) mirrors these in a later task; the role is derived from the contract either way. */
export const sprintRouter = router({
  list: vettedProcedure.input(z.object({ contractId: z.string().uuid() })).query(({ ctx, input }) => sprint.list(ctx.clerkUserId, input.contractId)),
  propose: vettedProcedure.input(z.object({ contractId: z.string().uuid(), items: itemsInput, ttdDays: ttd })).mutation(({ ctx, input }) => sprint.propose(ctx.clerkUserId, input.contractId, { items: input.items, ttdDays: input.ttdDays })),
  edit: vettedProcedure.input(z.object({ sprintId: z.string().uuid(), items: itemsInput, ttdDays: ttd })).mutation(({ ctx, input }) => sprint.edit(ctx.clerkUserId, input.sprintId, { items: input.items, ttdDays: input.ttdDays })),
  approve: vettedProcedure.input(z.object({ sprintId: z.string().uuid() })).mutation(({ ctx, input }) => sprint.approve(ctx.clerkUserId, input.sprintId)),
  cancel: vettedProcedure.input(z.object({ sprintId: z.string().uuid() })).mutation(({ ctx, input }) => sprint.cancel(ctx.clerkUserId, input.sprintId)),
})
