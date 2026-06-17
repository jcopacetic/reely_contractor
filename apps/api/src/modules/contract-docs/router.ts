import { z } from 'zod'
import { router, vettedProcedure, serviceProcedure } from '../../trpc/trpc'
import * as docs from './store'

const docInput = z.object({ kind: z.enum(['nda', 'ip_assignment', 'confidentiality', 'ic_agreement', 'non_solicit', 'custom']), title: z.string().min(1).max(200), body: z.string().min(1).max(50_000) })
const signer = z.string().min(1).max(200)

/** Board provider seam — the client manages/signs agreement docs (acts as the client; boardRef-scoped). */
const providerRouter = router({
  list: serviceProcedure.input(z.object({ contractRef: z.string().uuid() })).query(({ input }) => docs.providerList(input.contractRef)),
  add: serviceProcedure.input(z.object({ contractRef: z.string().uuid() }).and(docInput)).mutation(({ input }) => docs.providerAdd(input.contractRef, input)),
  edit: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), docId: z.string().uuid() }).and(docInput)).mutation(({ input }) => docs.providerEdit(input.contractRef, input.docId, input)),
  remove: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), docId: z.string().uuid() })).mutation(({ input }) => docs.providerRemove(input.contractRef, input.docId)),
  sign: serviceProcedure.input(z.object({ contractRef: z.string().uuid(), docId: z.string().uuid(), signerName: signer })).mutation(({ input }) => docs.providerSign(input.contractRef, input.docId, input.signerName)),
})

/** contract-docs tRPC surface — optional agreement docs on a contract (vetted participant) + the Board provider. */
export const contractDocsRouter = router({
  list: vettedProcedure.input(z.object({ contractId: z.string().uuid() })).query(({ ctx, input }) => docs.list(ctx.clerkUserId, input.contractId)),
  add: vettedProcedure.input(z.object({ contractId: z.string().uuid() }).and(docInput)).mutation(({ ctx, input }) => docs.add(ctx.clerkUserId, input.contractId, input)),
  edit: vettedProcedure.input(z.object({ docId: z.string().uuid() }).and(docInput)).mutation(({ ctx, input }) => docs.edit(ctx.clerkUserId, input.docId, input)),
  remove: vettedProcedure.input(z.object({ docId: z.string().uuid() })).mutation(({ ctx, input }) => docs.remove(ctx.clerkUserId, input.docId)),
  sign: vettedProcedure.input(z.object({ docId: z.string().uuid(), signerName: signer })).mutation(({ ctx, input }) => docs.sign(ctx.clerkUserId, input.docId, input.signerName)),
  provider: providerRouter,
})
