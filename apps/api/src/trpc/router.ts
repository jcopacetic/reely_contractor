import { router, publicProcedure } from './trpc'
import { identityRouter } from '../modules/contractor-identity/router'
import { profileRouter } from '../modules/profile/router'
import { feedRouter } from '../modules/feed/router'
import { graphRouter } from '../modules/graph/router'
import { dmRouter } from '../modules/dm/router'

/**
 * Contractor api router. health + contractor-identity (apply → admin approve → vetted, Clerk role mirror)
 * + profile (linktree public profile + onboarding) + feed (posts/reactions/comments) + graph (follows + the
 * in-club profile view) + dm (1:1 social messages). Achievements/XP run on the worker off the event stream;
 * the work-loop modules mount here as they land.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const, node: 'contractor' })),
  identity: identityRouter,
  profile: profileRouter,
  feed: feedRouter,
  graph: graphRouter,
  dm: dmRouter,
})

export type AppRouter = typeof appRouter
