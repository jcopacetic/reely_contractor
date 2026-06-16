/**
 * standup store — agile stand-ups on a contract: a structured progress update (done / next / blockers) posted
 * by a participant. The first chat-mediated ceremony; participant-scoped (client or the vetted contractor).
 * Additive — touches only the `standup` table; never the billing/charge path. Raw prisma + app-layer scoping.
 */
import { prisma } from '@contractor/db'
import { emit } from '../../events'

export type StandupView = { id: string; byUserId: string; done: string; next: string; blockers: string | null; createdAt: string; fromMe: boolean }

async function assertParticipant(contractId: string, userId: string): Promise<{ ok: true } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { clientUserId: true, contractorUserId: true } })
  if (!c) return { error: 'not_found' }
  if (c.clientUserId !== userId && c.contractorUserId !== userId) return { error: 'forbidden' }
  return { ok: true }
}

/** Post a stand-up on a contract (participant-gated). */
export async function post(viewerUserId: string, contractId: string, input: { done: string; next: string; blockers?: string | null }): Promise<{ id: string } | { error: string }> {
  const guard = await assertParticipant(contractId, viewerUserId)
  if ('error' in guard) return guard
  const s = await prisma.standup.create({
    data: { contractId, byUserId: viewerUserId, done: input.done.trim(), next: input.next.trim(), blockers: input.blockers?.trim() || null },
    select: { id: true },
  })
  await emit('standup', 'standup.posted', viewerUserId, { contractId, standupId: s.id }, 'contractor')
  return { id: s.id }
}

/** A contract's stand-ups, newest first (participant-gated). */
export async function list(viewerUserId: string, contractId: string): Promise<StandupView[] | { error: string }> {
  const guard = await assertParticipant(contractId, viewerUserId)
  if ('error' in guard) return guard
  const rows = await prisma.standup.findMany({
    where: { contractId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, byUserId: true, done: true, next: true, blockers: true, createdAt: true },
  })
  return rows.map((r) => ({ id: r.id, byUserId: r.byUserId, done: r.done, next: r.next, blockers: r.blockers, createdAt: r.createdAt.toISOString(), fromMe: r.byUserId === viewerUserId }))
}
