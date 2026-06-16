import { z } from 'zod'
import { router, vettedProcedure, serviceProcedure } from '../../trpc/trpc'
import * as sprint from './store'

const itemsInput = z.array(z.object({ title: z.string().min(1).max(200), effortPoints: z.number().int().min(0).max(1000) })).min(1).max(50)
const ttd = z.number().int().min(1).max(365)
const note = z.string().max(4000)

/** Board provider seam — the client negotiates sprints (acts as the client role; boardRef-scoped). */
const providerRouter = router({
  list: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => sprint.providerList(input.contractRef)),
  propose: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), items: itemsInput, ttdDays: ttd })).mutation(({ input }) => sprint.providerPropose(input.contractRef, { items: input.items, ttdDays: input.ttdDays })),
  edit: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), sprintId: z.string().uuid(), items: itemsInput, ttdDays: ttd })).mutation(({ input }) => sprint.providerEdit(input.contractRef, input.sprintId, { items: input.items, ttdDays: input.ttdDays })),
  approve: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), sprintId: z.string().uuid() })).mutation(({ input }) => sprint.providerApprove(input.contractRef, input.sprintId)),
  cancel: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), sprintId: z.string().uuid() })).mutation(({ input }) => sprint.providerCancel(input.contractRef, input.sprintId)),
  accept: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), sprintId: z.string().uuid() })).mutation(({ input }) => sprint.providerAccept(input.contractRef, input.sprintId)),
  requestChanges: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), sprintId: z.string().uuid(), note })).mutation(({ input }) => sprint.providerRequestChanges(input.contractRef, input.sprintId, input.note)),
})

/** sprint tRPC surface — propose / counter-edit / approve / cancel + list (vetted contractor participant) + the
 *  Board provider (the client side). The role is derived from the contract / provider seam either way. */
export const sprintRouter = router({
  list: vettedProcedure.input(z.object({ contractId: z.string().uuid() })).query(({ ctx, input }) => sprint.list(ctx.clerkUserId, input.contractId)),
  propose: vettedProcedure.input(z.object({ contractId: z.string().uuid(), items: itemsInput, ttdDays: ttd })).mutation(({ ctx, input }) => sprint.propose(ctx.clerkUserId, input.contractId, { items: input.items, ttdDays: input.ttdDays })),
  edit: vettedProcedure.input(z.object({ sprintId: z.string().uuid(), items: itemsInput, ttdDays: ttd })).mutation(({ ctx, input }) => sprint.edit(ctx.clerkUserId, input.sprintId, { items: input.items, ttdDays: input.ttdDays })),
  approve: vettedProcedure.input(z.object({ sprintId: z.string().uuid() })).mutation(({ ctx, input }) => sprint.approve(ctx.clerkUserId, input.sprintId)),
  cancel: vettedProcedure.input(z.object({ sprintId: z.string().uuid() })).mutation(({ ctx, input }) => sprint.cancel(ctx.clerkUserId, input.sprintId)),
  submit: vettedProcedure.input(z.object({ sprintId: z.string().uuid(), note })).mutation(({ ctx, input }) => sprint.submit(ctx.clerkUserId, input.sprintId, input.note)),
  accept: vettedProcedure.input(z.object({ sprintId: z.string().uuid() })).mutation(({ ctx, input }) => sprint.accept(ctx.clerkUserId, input.sprintId)),
  requestChanges: vettedProcedure.input(z.object({ sprintId: z.string().uuid(), note })).mutation(({ ctx, input }) => sprint.requestChanges(ctx.clerkUserId, input.sprintId, input.note)),
  provider: providerRouter,
})
