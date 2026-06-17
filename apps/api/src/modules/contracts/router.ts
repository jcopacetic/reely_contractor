import { z } from 'zod'
import { router, vettedProcedure, serviceProcedure } from '../../trpc/trpc'
import * as contracts from './store'

const itemKind = z.enum(['milestone', 'scope_add', 'deliverable', 'note'])
const contractStatus = z.enum(['active', 'paused', 'completed', 'cancelled'])

/** Provider surface (Board): create the Contract on hire + read it. Service-key; resource-scoped to
 *  Board-originated (boardRef) contracts. Board's client calls these as `/trpc/contracts.provider.*`. */
const providerRouter = router({
  createContract: serviceProcedure
    .input(z.object({ listingRef: z.string().uuid().nullish(), bidRef: z.string().uuid().nullish(), contractorUserId: z.string().min(1), boardRef: z.string().nullish() }))
    .mutation(({ input }) => contracts.providerCreateContract(input)),
  getContract: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => contracts.providerGetContract(input.contractRef)),
  // The Board client pauses/resumes a contract (stops the clock + notifies both parties).
  setPaused: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), paused: z.boolean() })).mutation(({ input }) => contracts.providerSetPaused(input.contractRef, input.paused)),
})

/** contracts tRPC surface — the contractor's living hire container (participant-scoped) + the Board provider. */
export const contractsRouter = router({
  get: vettedProcedure.input(z.object({ contractId: z.string().uuid() })).query(({ ctx, input }) => contracts.getContract(ctx.clerkUserId, input.contractId)),
  listMine: vettedProcedure.query(({ ctx }) => contracts.listMine(ctx.clerkUserId)),
  // Native: the listing owner turns their accepted bid into a contract.
  createFromBid: vettedProcedure.input(z.object({ bidId: z.string().uuid() })).mutation(({ ctx, input }) => contracts.createFromBid(input.bidId, null, ctx.clerkUserId)),
  addItem: vettedProcedure
    .input(z.object({ contractId: z.string().uuid(), kind: itemKind, title: z.string().min(1).max(200), description: z.string().max(2000).nullish(), amount: z.number().positive().max(1_000_000).nullish() }))
    .mutation(({ ctx, input }) => {
      const { contractId, ...item } = input
      return contracts.addItem(ctx.clerkUserId, contractId, item)
    }),
  updateStatus: vettedProcedure.input(z.object({ contractId: z.string().uuid(), status: contractStatus })).mutation(({ ctx, input }) => contracts.updateStatus(ctx.clerkUserId, input.contractId, input.status)),
  // A participant pauses/resumes the contract (the client's quick control; stops the clock + notifies both).
  setPaused: vettedProcedure.input(z.object({ contractId: z.string().uuid(), paused: z.boolean() })).mutation(({ ctx, input }) => contracts.setPaused(ctx.clerkUserId, input.contractId, input.paused)),
  // Definition of Done — the contractor drafts the acceptance bar (mutual-lock lands with the client surface).
  setDefinitionOfDone: vettedProcedure.input(z.object({ contractId: z.string().uuid(), text: z.string().max(4000) })).mutation(({ ctx, input }) => contracts.setDefinitionOfDone(ctx.clerkUserId, input.contractId, input.text)),
  provider: providerRouter,
})
