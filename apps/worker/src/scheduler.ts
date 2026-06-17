/**
 * Repeatable-job registration (run once on worker boot). The weekly billing cycle fires Sun 18:00 UTC; BullMQ
 * dedups the schedule on its repeat key + jobId, so re-booting replaces the schedule rather than stacking
 * duplicates. Admins can also enqueue `payments.billing-cycle` ad-hoc for testing — same handler.
 */
import { Queue } from 'bullmq'
import { CONTRACTOR_QUEUE, JOBS, connection } from './connection'

export async function registerSchedules(): Promise<void> {
  const queue = new Queue(CONTRACTOR_QUEUE, { connection })
  await queue.add(JOBS.billingCycle, {}, { repeat: { pattern: '0 18 * * 0', tz: 'UTC' }, jobId: 'billing-cycle-weekly' })
  // Daily notification digest — a low-spam roll-up of each recipient's unread, not-yet-emailed notifications.
  await queue.add(JOBS.notifyDigest, {}, { repeat: { pattern: '0 14 * * *', tz: 'UTC' }, jobId: 'notification-digest-daily' })
  await queue.close()
  console.log('scheduled: payments.billing-cycle (Sun 18:00 UTC), notifications.digest (daily 14:00 UTC)')
}
