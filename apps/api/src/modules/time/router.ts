import { z } from 'zod'
import { router, vettedProcedure, serviceProcedure, extensionProcedure } from '../../trpc/trpc'
import * as time from './store'

const sampleSchema = z.object({ capturedAt: z.string().datetime(), activityPct: z.number().min(0).max(100).nullish(), title: z.string().max(200).nullish(), screenshotKey: z.string().max(300).nullish() })

/** Extension surface — the browser-timer extension (token-auth via extensionProcedure) drives the timer +
 *  pushes activity/screenshot evidence. Same store functions as the contractor; the token resolves the user. */
const extensionRouter = router({
  start: extensionProcedure.input(z.object({ contractId: z.string().uuid(), description: z.string().max(2000).nullish() })).mutation(({ ctx, input }) => time.start(ctx.clerkUserId, input.contractId, { description: input.description, source: 'extension' })),
  stop: extensionProcedure.input(z.object({ entryId: z.string().uuid() })).mutation(({ ctx, input }) => time.stop(ctx.clerkUserId, input.entryId)),
  manualEntry: extensionProcedure
    .input(z.object({ contractId: z.string().uuid(), startedAt: z.string().datetime(), endedAt: z.string().datetime(), description: z.string().max(2000).nullish() }))
    .mutation(({ ctx, input }) => time.manualEntry(ctx.clerkUserId, input.contractId, { startedAt: input.startedAt, endedAt: input.endedAt, description: input.description, source: 'extension' })),
  presignScreenshot: extensionProcedure.input(z.object({ entryId: z.string().uuid() })).mutation(({ ctx, input }) => time.presignScreenshot(ctx.clerkUserId, input.entryId)),
  submitActivity: extensionProcedure.input(z.object({ entryId: z.string().uuid(), samples: z.array(sampleSchema).max(200) })).mutation(({ ctx, input }) => time.submitActivity(ctx.clerkUserId, input.entryId, input.samples)),
})

/** Provider surface (Board): read a contract's time + approve an entry. Service-key; resource-scoped to
 *  Board-originated (boardRef) contracts. Board's client calls these as `/trpc/time.provider.*`. */
const providerRouter = router({
  listTime: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => time.providerListTime(input.contractRef)),
  approve: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), entryId: z.string().uuid() })).mutation(({ input }) => time.providerApprove(input.contractRef, input.entryId)),
  dispute: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), entryId: z.string().uuid(), reason: z.string().max(2000) })).mutation(({ input }) => time.providerDispute(input.contractRef, input.entryId, input.reason)),
  entryEvidence: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), entryId: z.string().uuid() })).query(({ input }) => time.providerEntryEvidence(input.contractRef, input.entryId)),
})

/** time tRPC surface — the contractor's timer/manual entries + the client's approval, plus the Board provider.
 *  The contractor (contract's contractor) writes; the contract's client approves; only approved time bills. */
export const timeRouter = router({
  // contractor (writes own)
  start: vettedProcedure
    .input(z.object({ contractId: z.string().uuid(), description: z.string().max(2000).nullish(), source: z.enum(['timer', 'extension']).optional() }))
    .mutation(({ ctx, input }) => time.start(ctx.clerkUserId, input.contractId, { description: input.description, source: input.source })),
  stop: vettedProcedure.input(z.object({ entryId: z.string().uuid() })).mutation(({ ctx, input }) => time.stop(ctx.clerkUserId, input.entryId)),
  cancelRunning: vettedProcedure.input(z.object({ entryId: z.string().uuid() })).mutation(({ ctx, input }) => time.cancelRunning(ctx.clerkUserId, input.entryId)),
  // contractor deletes own tracked time (un-billed) — also how a contractor concedes a dispute
  deleteEntry: vettedProcedure.input(z.object({ entryId: z.string().uuid() })).mutation(({ ctx, input }) => time.deleteEntry(ctx.clerkUserId, input.entryId)),
  manualEntry: vettedProcedure
    .input(z.object({ contractId: z.string().uuid(), startedAt: z.string().datetime(), endedAt: z.string().datetime(), description: z.string().max(2000).nullish(), source: z.enum(['manual', 'extension']).optional() }))
    .mutation(({ ctx, input }) => time.manualEntry(ctx.clerkUserId, input.contractId, { startedAt: input.startedAt, endedAt: input.endedAt, description: input.description, source: input.source })),
  getRunning: vettedProcedure.query(({ ctx }) => time.getRunning(ctx.clerkUserId)),
  // participant read
  listTime: vettedProcedure.input(z.object({ contractId: z.string().uuid() })).query(({ ctx, input }) => time.listTime(ctx.clerkUserId, input.contractId)),
  // client (approves)
  approve: vettedProcedure.input(z.object({ entryId: z.string().uuid() })).mutation(({ ctx, input }) => time.approve(ctx.clerkUserId, input.entryId)),
  unapprove: vettedProcedure.input(z.object({ entryId: z.string().uuid() })).mutation(({ ctx, input }) => time.unapprove(ctx.clerkUserId, input.entryId)),
  dispute: vettedProcedure.input(z.object({ entryId: z.string().uuid(), reason: z.string().min(1).max(2000) })).mutation(({ ctx, input }) => time.dispute(ctx.clerkUserId, input.entryId, input.reason)),
  withdrawDispute: vettedProcedure.input(z.object({ entryId: z.string().uuid() })).mutation(({ ctx, input }) => time.withdrawDispute(ctx.clerkUserId, input.entryId)),
  entryEvidence: vettedProcedure.input(z.object({ entryId: z.string().uuid() })).query(({ ctx, input }) => time.entryEvidence(ctx.clerkUserId, input.entryId)),
  extension: extensionRouter,
  provider: providerRouter,
})
