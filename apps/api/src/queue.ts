/**
 * BullMQ producer (the api side). The api enqueues background work onto the shared `contractor` queue; the
 * worker (apps/worker) consumes it. Best-effort: a Redis hiccup never fails the originating request — the
 * event log is already durable, the queue is the async fan-out for gamification / notifications.
 */
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { env } from './env'

const CONTRACTOR_QUEUE = 'contractor' as const

let queue: Queue | null = null

function getQueue(): Queue | null {
  if (queue) return queue
  try {
    const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
    connection.on('error', () => {}) // swallow — producer is best-effort
    queue = new Queue(CONTRACTOR_QUEUE, { connection })
    return queue
  } catch {
    return null
  }
}

/** Enqueue a job (fire-and-forget; swallows producer errors so the request path never breaks). */
export async function enqueue(name: string, data: unknown): Promise<void> {
  const q = getQueue()
  if (!q) return
  try {
    await q.add(name, data, {
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    })
  } catch {
    /* best-effort */
  }
}
