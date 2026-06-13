import { z } from 'zod'
import { router, vettedProcedure } from '../../trpc/trpc'
import * as tokens from './store'

/** extension-token tRPC surface — the contractor mints/lists/revokes the credentials their timer extension uses. */
export const extensionTokenRouter = router({
  mint: vettedProcedure.input(z.object({ label: z.string().max(80).optional() })).mutation(({ ctx, input }) => tokens.mint(ctx.clerkUserId, input.label)),
  list: vettedProcedure.query(({ ctx }) => tokens.list(ctx.clerkUserId)),
  revoke: vettedProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ ctx, input }) => tokens.revoke(ctx.clerkUserId, input.id)),
})
