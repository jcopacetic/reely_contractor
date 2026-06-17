import { router, publicProcedure } from './trpc'
import { identityRouter } from '../modules/contractor-identity/router'
import { profileRouter } from '../modules/profile/router'
import { feedRouter } from '../modules/feed/router'
import { graphRouter } from '../modules/graph/router'
import { dmRouter } from '../modules/dm/router'
import { marketplaceRouter } from '../modules/marketplace/router'
import { jobFeedRouter } from '../modules/job-feed/router'
import { contractsRouter } from '../modules/contracts/router'
import { timeRouter } from '../modules/time/router'
import { extensionTokenRouter } from '../modules/extension-token/router'
import { paymentsRouter } from '../modules/payments/router'
import { reviewsRouter } from '../modules/reviews/router'
import { standupRouter } from '../modules/standup/router'
import { sprintRouter } from '../modules/sprint/router'
import { blockerRouter } from '../modules/blocker/router'
import { changeRequestRouter } from '../modules/change-request/router'
import { charterRouter } from '../modules/charter/router'
import { notificationsRouter } from '../modules/notifications/router'

/**
 * Contractor api router. health + contractor-identity (apply → admin approve → vetted, Clerk role mirror)
 * + profile (linktree public profile + onboarding) + feed (posts/reactions/comments) + graph (follows + the
 * in-club profile view) + dm (1:1 social messages) + the work-loop: marketplace (listing/bid + Board provider)
 * and jobFeed (vetted browse) + contracts (the living hire container) + time (timer/manual entries + client
 * approval; only approved time bills). Achievements/XP run on the worker off the event stream; payments mounts
 * here as it lands.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const, node: 'contractor' })),
  identity: identityRouter,
  profile: profileRouter,
  feed: feedRouter,
  graph: graphRouter,
  dm: dmRouter,
  marketplace: marketplaceRouter,
  jobFeed: jobFeedRouter,
  contracts: contractsRouter,
  time: timeRouter,
  extensionToken: extensionTokenRouter,
  payments: paymentsRouter,
  reviews: reviewsRouter,
  standup: standupRouter,
  sprint: sprintRouter,
  blocker: blockerRouter,
  changeRequest: changeRequestRouter,
  charter: charterRouter,
  notifications: notificationsRouter,
})

export type AppRouter = typeof appRouter
