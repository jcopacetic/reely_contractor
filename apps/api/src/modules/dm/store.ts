/**
 * dm store — general social direct messages (contractor ↔ contractor). 1:1 threads; the participant pair is
 * stored sorted (userA < userB) so (a,b) and (b,a) resolve to one thread. Every read/write is PARTICIPANT-GATED
 * (the viewer must be userA or userB). Sending emits `dm.sent` (notifications consume it later). Realtime is a
 * later enhancement — v1 is server-action reads + a light client poll while a thread is open.
 */
import { prisma } from '@contractor/db'
import { emit } from '../../events'

type Participant = { userId: string; displayName: string; avatarUrl: string | null }
type Message = { id: string; body: string; fromMe: boolean; senderUserId: string; createdAt: string }
type ThreadSummary = {
  threadId: string
  other: Participant
  lastMessage: { body: string; fromMe: boolean; createdAt: string } | null
  unread: number
  lastActivityAt: string
}

/** Sorted participant pair → the canonical (userA, userB) for the unique thread key. */
function pair(u1: string, u2: string): [string, string] {
  return u1 < u2 ? [u1, u2] : [u2, u1]
}

async function profilesFor(ids: string[]): Promise<Map<string, Participant>> {
  if (ids.length === 0) return new Map()
  const ps = await prisma.contractorProfile.findMany({ where: { clerkUserId: { in: ids } }, select: { clerkUserId: true, displayName: true, avatarUrl: true } })
  return new Map(ps.map((p) => [p.clerkUserId, { userId: p.clerkUserId, displayName: p.displayName, avatarUrl: p.avatarUrl }]))
}

/** Find or create the 1:1 thread between the viewer and another contractor. Returns the threadId + the other. */
export async function openThread(viewerUserId: string, otherUserId: string): Promise<{ threadId: string; other: Participant } | { error: string }> {
  if (viewerUserId === otherUserId) return { error: 'self' }
  const op = await prisma.contractorProfile.findUnique({ where: { clerkUserId: otherUserId }, select: { clerkUserId: true, displayName: true, avatarUrl: true } })
  if (!op) return { error: 'not_found' }
  const [a, b] = pair(viewerUserId, otherUserId)
  const thread = await prisma.dmThread.upsert({
    where: { userAUserId_userBUserId: { userAUserId: a, userBUserId: b } },
    update: {},
    create: { userAUserId: a, userBUserId: b },
    select: { id: true },
  })
  return { threadId: thread.id, other: { userId: op.clerkUserId, displayName: op.displayName, avatarUrl: op.avatarUrl } }
}

/** The viewer's threads, newest-activity first, each with the other participant + last message + unread count. */
export async function listThreads(viewerUserId: string): Promise<ThreadSummary[]> {
  const threads = await prisma.dmThread.findMany({
    where: { OR: [{ userAUserId: viewerUserId }, { userBUserId: viewerUserId }] },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    take: 50,
    select: { id: true, userAUserId: true, userBUserId: true, lastMessageAt: true, createdAt: true },
  })
  if (threads.length === 0) return []
  const threadIds = threads.map((t) => t.id)
  const otherIds = threads.map((t) => (t.userAUserId === viewerUserId ? t.userBUserId : t.userAUserId))
  const [profiles, lastMsgs, unreadGroups] = await Promise.all([
    profilesFor([...new Set(otherIds)]),
    prisma.dmMessage.findMany({ where: { threadId: { in: threadIds } }, orderBy: { createdAt: 'desc' }, distinct: ['threadId'], select: { threadId: true, body: true, senderUserId: true, createdAt: true } }),
    prisma.dmMessage.groupBy({ by: ['threadId'], where: { threadId: { in: threadIds }, senderUserId: { not: viewerUserId }, readAt: null }, _count: { _all: true } }),
  ])
  const lastByThread = new Map(lastMsgs.map((m) => [m.threadId, m]))
  const unreadByThread = new Map(unreadGroups.map((g) => [g.threadId, g._count._all]))
  return threads.map((t) => {
    const otherId = t.userAUserId === viewerUserId ? t.userBUserId : t.userAUserId
    const other = profiles.get(otherId) ?? { userId: otherId, displayName: 'Contractor', avatarUrl: null }
    const last = lastByThread.get(t.id)
    return {
      threadId: t.id,
      other,
      lastMessage: last ? { body: last.body, fromMe: last.senderUserId === viewerUserId, createdAt: last.createdAt.toISOString() } : null,
      unread: unreadByThread.get(t.id) ?? 0,
      lastActivityAt: (t.lastMessageAt ?? t.createdAt).toISOString(),
    }
  })
}

/** Messages in a thread (participant-gated), oldest→newest. Marks the other party's unread messages read. */
export async function listMessages(viewerUserId: string, threadId: string, limit = 50, before?: string): Promise<{ messages: Message[]; other: Participant } | { error: string }> {
  const thread = await prisma.dmThread.findUnique({ where: { id: threadId }, select: { userAUserId: true, userBUserId: true } })
  if (!thread) return { error: 'not_found' }
  if (thread.userAUserId !== viewerUserId && thread.userBUserId !== viewerUserId) return { error: 'forbidden' }
  const otherId = thread.userAUserId === viewerUserId ? thread.userBUserId : thread.userAUserId
  const rows = await prisma.dmMessage.findMany({
    where: { threadId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
    select: { id: true, body: true, senderUserId: true, createdAt: true },
  })
  await prisma.dmMessage.updateMany({ where: { threadId, senderUserId: { not: viewerUserId }, readAt: null }, data: { readAt: new Date() } })
  const other = (await profilesFor([otherId])).get(otherId) ?? { userId: otherId, displayName: 'Contractor', avatarUrl: null }
  const messages = rows.reverse().map((m) => ({ id: m.id, body: m.body, fromMe: m.senderUserId === viewerUserId, senderUserId: m.senderUserId, createdAt: m.createdAt.toISOString() }))
  return { messages, other }
}

/** Send a message in a thread (participant-gated). Bumps lastMessageAt; emits dm.sent. */
export async function sendMessage(viewerUserId: string, threadId: string, body: string): Promise<{ id: string } | { error: string }> {
  const thread = await prisma.dmThread.findUnique({ where: { id: threadId }, select: { userAUserId: true, userBUserId: true } })
  if (!thread) return { error: 'not_found' }
  if (thread.userAUserId !== viewerUserId && thread.userBUserId !== viewerUserId) return { error: 'forbidden' }
  const otherId = thread.userAUserId === viewerUserId ? thread.userBUserId : thread.userAUserId
  const msg = await prisma.dmMessage.create({ data: { threadId, senderUserId: viewerUserId, body: body.trim() } })
  await prisma.dmThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } })
  await emit('dm', 'dm.sent', viewerUserId, { threadId, to: otherId, messageId: msg.id })
  return { id: msg.id }
}

/** Total unread messages addressed to the viewer (for the nav badge). */
export async function unreadCount(viewerUserId: string): Promise<number> {
  const threads = await prisma.dmThread.findMany({ where: { OR: [{ userAUserId: viewerUserId }, { userBUserId: viewerUserId }] }, select: { id: true } })
  if (threads.length === 0) return 0
  return prisma.dmMessage.count({ where: { threadId: { in: threads.map((t) => t.id) }, senderUserId: { not: viewerUserId }, readAt: null } })
}
