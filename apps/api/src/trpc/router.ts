import { router, publicProcedure } from './trpc'
import { identityRouter } from '../modules/contractor-identity/router'
import { profileRouter } from '../modules/profile/router'
import { feedRouter } from '../modules/feed/router'

/**
 * Contractor api router. health + contractor-identity (apply → admin approve → vetted, Clerk role mirror)
 * + profile (linktree public profile + onboarding) + feed (the social club: posts + reactions). The rest of
 * the social modules (comments, follows, achievements, DMs) + the work-loop mount here as they land.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const, node: 'contractor' })),
  identity: identityRouter,
  profile: profileRouter,
  feed: feedRouter,
})

export type AppRouter = typeof appRouter
