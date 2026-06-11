/**
 * emit() — the single writer for contractor-actor social events. Writes the immutable app_event row AND fans
 * the event to the achievements engine (worker) so XP/streak/awards stay in lockstep with the activity that
 * earned them. Best-effort enqueue: the durable record is the app_event; the queue is the async side-effect.
 */
import { prisma, type ActorType, Prisma } from '@contractor/db'
import { enqueue } from './queue'

export async function emit(
  source: string,
  type: string,
  actorId: string,
  payload: Prisma.InputJsonValue = {},
  actorType: ActorType = 'contractor',
): Promise<void> {
  await prisma.appEvent.create({ data: { source, type, actorId, actorType, payload } })
  await enqueue('achievements.process', { userId: actorId, type, actorType })
}
