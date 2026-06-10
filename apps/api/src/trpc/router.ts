import { router, publicProcedure } from './trpc'
import { identityRouter } from '../modules/contractor-identity/router'

/**
 * Contractor api router. health + the contractor-identity surface (apply → admin approve → vetted, with
 * the Clerk role mirror). Social + work-loop module routers mount here as they land.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const, node: 'contractor' })),
  identity: identityRouter,
})

export type AppRouter = typeof appRouter
