import { Redis } from 'ioredis'

/** Shared BullMQ connection. maxRetriesPerRequest must be null for BullMQ. */
export const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6383', { maxRetriesPerRequest: null })

export const CONTRACTOR_QUEUE = 'contractor' as const

/** Job names handled by the contractor worker (filled in as modules land: notifications, billing-cycle, …). */
export const JOBS = {
  achievementsProcess: 'achievements.process',
  notifyDispatch: 'notifications.dispatch',
  billingCycle: 'payments.billing-cycle',
} as const

export type JobName = (typeof JOBS)[keyof typeof JOBS]
