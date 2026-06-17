import { Worker, type Job } from 'bullmq'
import { CONTRACTOR_QUEUE, JOBS, connection } from './connection'
import { processAchievements, shareWorkActivity } from './achievements'
import { maybeRecomputeStats } from './stats'
import { runBillingCycle } from './payments'
import { runNotificationDigest } from '@contractor/api/notifications-email'
import { registerSchedules } from './scheduler'

const SERVICE = 'contractor-worker'

/**
 * Contractor background worker. Processes the contractor queue: achievements/XP fan-out now; notifications
 * dispatch + the weekly billing-cycle in Phase 2. Handlers register as their modules land; an unknown job throws.
 */
async function processJob(job: Job): Promise<void> {
  switch (job.name) {
    case JOBS.achievementsProcess:
      await processAchievements(job.data)
      await shareWorkActivity(job.data)
      await maybeRecomputeStats(job.data)
      return
    case JOBS.billingCycle: {
      const r = await runBillingCycle()
      console.log(`billing-cycle: charged ${r.charged}, swept ${r.swept}`)
      return
    }
    case JOBS.notifyDigest: {
      const r = await runNotificationDigest()
      console.log(`notification-digest: ${r.emails} emails to ${r.recipients} recipients (${r.notifications} notifications)`)
      return
    }
    default:
      throw new Error(`unknown job: ${job.name}`)
  }
}

async function main() {
  const worker = new Worker(CONTRACTOR_QUEUE, processJob, { connection, concurrency: 4 })
  worker.on('ready', () => console.log(`${SERVICE} ready on queue "${CONTRACTOR_QUEUE}"`))
  worker.on('failed', (job, err) => console.error(`job ${job?.name} failed:`, err.message))
  await registerSchedules()

  const shutdown = async () => {
    await worker.close()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
