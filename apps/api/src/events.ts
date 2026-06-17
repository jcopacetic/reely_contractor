/**
 * emit() — the single writer for contractor-actor social events. Writes the immutable app_event row AND fans
 * the event to the achievements engine (worker) so XP/streak/awards stay in lockstep with the activity that
 * earned them. The durable record is the app_event (awaited); the queue is a FIRE-AND-FORGET side-effect —
 * never awaited, so a slow/cold Redis can't add latency to (or hang) the request that emitted the event.
 */
import { prisma, type ActorType, Prisma } from '@contractor/db'
import { enqueue } from './queue'
import { isNotifiable, notifyForEvent } from './notify'

export async function emit(
  source: string,
  type: string,
  actorId: string,
  payload: Prisma.InputJsonValue = {},
  actorType: ActorType = 'contractor',
): Promise<void> {
  await prisma.appEvent.create({ data: { source, type, actorId, actorType, payload } })
  // Fire-and-forget: the achievements fan-out must never block the request path (the event is durable).
  void enqueue('achievements.process', { userId: actorId, type, actorType, payload }).catch(() => {})
  // Fire-and-forget: notify the counterparty on curated ceremony events (never blocks / fails the action).
  if (isNotifiable(type)) void notifyForEvent(type, actorType, payload).catch(() => {})
}
