/**
 * notifications store — the in-app bell, reading the user-scoped `notification` table that emit() fans
 * ceremony events into. The viewer (vetted contractor) reads/marks their OWN rows. The Board reads the
 * CLIENT's rows for a contract via the provider seam (boardRef-scoped). Display data lives in `payload`
 * (contractId / contractTitle / title / ceremony / actorRole). Read-state is per-row. Raw prisma + scoping.
 */
import { prisma, Prisma } from '@contractor/db'
import { asCategoryPrefs, channelEnabled, type CategoryPrefs, type Channel } from './prefs'

export type NotificationView = {
  id: string
  type: string
  ceremony: string
  title: string
  contractId: string | null
  contractTitle: string | null
  actorRole: string | null
  read: boolean
  createdAt: string
}

export function toView(n: { id: string; type: string; payload: unknown; readAt: Date | null; createdAt: Date }): NotificationView {
  const p = (n.payload ?? {}) as Record<string, unknown>
  return {
    id: n.id,
    type: n.type,
    ceremony: typeof p.ceremony === 'string' ? p.ceremony : n.type.split('.')[0] ?? 'activity',
    title: typeof p.title === 'string' ? p.title : n.type,
    contractId: typeof p.contractId === 'string' ? p.contractId : null,
    contractTitle: typeof p.contractTitle === 'string' ? p.contractTitle : null,
    actorRole: typeof p.actorRole === 'string' ? p.actorRole : null,
    read: n.readAt != null,
    createdAt: n.createdAt.toISOString(),
  }
}

const MAX = 50

export async function list(viewerUserId: string): Promise<{ items: NotificationView[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: viewerUserId }, orderBy: { createdAt: 'desc' }, take: MAX, select: { id: true, type: true, payload: true, readAt: true, createdAt: true } }),
    prisma.notification.count({ where: { userId: viewerUserId, readAt: null } }),
  ])
  return { items: rows.map(toView), unread }
}

export async function unreadCount(viewerUserId: string): Promise<{ unread: number }> {
  return { unread: await prisma.notification.count({ where: { userId: viewerUserId, readAt: null } }) }
}

export async function markRead(viewerUserId: string, id: string): Promise<{ ok: true }> {
  await prisma.notification.updateMany({ where: { id, userId: viewerUserId, readAt: null }, data: { readAt: new Date() } })
  return { ok: true }
}

export async function markAllRead(viewerUserId: string): Promise<{ ok: true }> {
  await prisma.notification.updateMany({ where: { userId: viewerUserId, readAt: null }, data: { readAt: new Date() } })
  return { ok: true }
}

// ── preferences (the category × channel matrix; absent = on) ──────────────────────────────────────────
export async function getPrefs(userId: string): Promise<{ emailUnsubscribed: boolean; categories: CategoryPrefs }> {
  const p = await prisma.notificationPref.findUnique({ where: { userId }, select: { emailUnsubscribed: true, categoryPrefs: true } })
  return { emailUnsubscribed: p?.emailUnsubscribed ?? false, categories: asCategoryPrefs(p?.categoryPrefs) }
}

export async function setCategoryPref(userId: string, category: string, channel: Channel, on: boolean): Promise<{ ok: true }> {
  const cur = await getPrefs(userId)
  const next: CategoryPrefs = { ...cur.categories, [category]: { ...cur.categories[category], [channel]: on } }
  const json = next as unknown as Prisma.InputJsonValue
  await prisma.notificationPref.upsert({ where: { userId }, create: { userId, categoryPrefs: json }, update: { categoryPrefs: json } })
  return { ok: true }
}

/** Master email switch (the settings toggle + the re-subscribe path; the email link sets it true). */
export async function setEmailUnsubscribed(userId: string, unsubscribed: boolean): Promise<{ ok: true }> {
  await prisma.notificationPref.upsert({ where: { userId }, create: { userId, emailUnsubscribed: unsubscribed }, update: { emailUnsubscribed: unsubscribed } })
  return { ok: true }
}

/** In-app gate the writers (notify.ts, hire) consult before creating a row. Default ON; never throws. */
export async function inAppEnabled(userId: string, category: string): Promise<boolean> {
  try {
    const p = await prisma.notificationPref.findUnique({ where: { userId }, select: { categoryPrefs: true } })
    return channelEnabled(asCategoryPrefs(p?.categoryPrefs), category, 'inApp')
  } catch {
    return true
  }
}

// ── provider (Board, service-key; the CLIENT's notifications for a contract, boardRef-scoped) ──────────
async function clientOf(contractRef: string): Promise<{ clientUserId: string } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractRef }, select: { boardRef: true, clientUserId: true } })
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  return { clientUserId: c.clientUserId }
}

const byContract = (contractRef: string, clientUserId: string) => ({ userId: clientUserId, payload: { path: ['contractId'], equals: contractRef } as const })

export async function providerListForContract(contractRef: string): Promise<{ items: NotificationView[]; unread: number } | { error: string }> {
  const g = await clientOf(contractRef)
  if ('error' in g) return g
  const where = byContract(contractRef, g.clientUserId)
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: MAX, select: { id: true, type: true, payload: true, readAt: true, createdAt: true } }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ])
  return { items: rows.map(toView), unread }
}

export async function providerMarkAllReadForContract(contractRef: string): Promise<{ ok: true } | { error: string }> {
  const g = await clientOf(contractRef)
  if ('error' in g) return g
  await prisma.notification.updateMany({ where: { ...byContract(contractRef, g.clientUserId), readAt: null }, data: { readAt: new Date() } })
  return { ok: true }
}
