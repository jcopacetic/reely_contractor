/**
 * room store — chat rooms (generalizes the old 1:1 DM). A `direct` room is contractor↔contractor (the social
 * club); `hire`/`team` rooms pair a tenant (an opaque Board org ref) with one or more contractors, reached from
 * Board via the provider surface. Every message is sent by an INDIVIDUAL; a tenant-side message carries a
 * sender_tenant_ref + sender_label for "Name · Org" attribution. Access: native = an active contractor
 * participant of the room; provider = the room's tenant participant matches the passed tenantRef (Board vouches
 * the acting member). Unread is a per-(room,user) cursor (room_read); team history is gated by joined_at. Raw
 * prisma + app-layer scoping (the api connects as owner; RLS is defense-in-depth). Writes room* only.
 */
import { prisma, type Prisma } from '@contractor/db'
import { emit } from '../../events'

type Participant = { userId: string; displayName: string; avatarUrl: string | null }
type Kind = 'direct' | 'hire' | 'team'
export type RoomMsg = { id: string; body: string; fromMe: boolean; senderUserId: string; senderLabel: string; fromTenant: boolean; createdAt: string }
export type RoomSummary = { roomId: string; kind: Kind; title: string; avatarUrl: string | null; lastMessage: { body: string; createdAt: string } | null; unread: number; lastActivityAt: string }

const maxDate = (a: Date | null, b: Date): Date => (a && a > b ? a : b)

async function profilesFor(ids: string[]): Promise<Map<string, Participant>> {
  if (ids.length === 0) return new Map()
  const rows = await prisma.contractorProfile.findMany({ where: { clerkUserId: { in: ids } }, select: { clerkUserId: true, displayName: true, avatarUrl: true } })
  return new Map(rows.map((r) => [r.clerkUserId, { userId: r.clerkUserId, displayName: r.displayName, avatarUrl: r.avatarUrl }]))
}

/** Set/advance a user's read cursor for a room (the unread floor). */
export async function setRead(userId: string, roomId: string): Promise<void> {
  await prisma.roomRead.upsert({ where: { roomId_userId: { roomId, userId } }, create: { roomId, userId, lastReadAt: new Date() }, update: { lastReadAt: new Date() } })
}

/** Unread in a room for a user = messages after max(lastRead, their joinedAt) not sent by them. */
async function unreadFor(roomId: string, userId: string, joinedAt: Date, lastReadAt: Date | null): Promise<number> {
  return prisma.roomMessage.count({ where: { roomId, createdAt: { gt: maxDate(lastReadAt, joinedAt) }, senderUserId: { not: userId } } })
}

type RoomRow = { id: string; kind: Kind; title: string | null; lastMessageAt: Date | null; createdAt: Date }
/** Summaries for a set of rooms as seen by `userId`; `label(roomId)` decides the per-side title/avatar. */
async function summarize(rooms: RoomRow[], userId: string, joinedAt: Map<string, Date>, label: (roomId: string) => { title: string; avatarUrl: string | null }): Promise<RoomSummary[]> {
  const ids = rooms.map((r) => r.id)
  const reads = await prisma.roomRead.findMany({ where: { roomId: { in: ids }, userId }, select: { roomId: true, lastReadAt: true } })
  const lastReadAt = new Map(reads.map((r) => [r.roomId, r.lastReadAt]))
  const lastMsgs = await prisma.roomMessage.findMany({ where: { roomId: { in: ids } }, orderBy: { createdAt: 'desc' }, distinct: ['roomId'], select: { roomId: true, body: true, createdAt: true } })
  const lastMsg = new Map(lastMsgs.map((m) => [m.roomId, m]))
  return Promise.all(
    rooms.map(async (r) => {
      const l = label(r.id)
      const lm = lastMsg.get(r.id)
      return {
        roomId: r.id,
        kind: r.kind,
        title: l.title,
        avatarUrl: l.avatarUrl,
        lastMessage: lm ? { body: lm.body, createdAt: lm.createdAt.toISOString() } : null,
        unread: await unreadFor(r.id, userId, joinedAt.get(r.id) ?? r.createdAt, lastReadAt.get(r.id) ?? null),
        lastActivityAt: (r.lastMessageAt ?? r.createdAt).toISOString(),
      }
    }),
  )
}

/** Render a room's messages for `userId` (join-gated, oldest→newest), resolving contractor sender labels. */
async function renderMessages(roomId: string, userId: string, joinedAt: Date, limit: number, before?: string): Promise<RoomMsg[]> {
  const where: Prisma.RoomMessageWhereInput = { roomId, createdAt: before ? { gte: joinedAt, lt: new Date(before) } : { gte: joinedAt } }
  const rows = await prisma.roomMessage.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 100), select: { id: true, body: true, senderUserId: true, senderTenantRef: true, senderLabel: true, createdAt: true } })
  const profiles = await profilesFor([...new Set(rows.filter((m) => !m.senderTenantRef).map((m) => m.senderUserId))])
  return rows.reverse().map((m) => ({
    id: m.id,
    body: m.body,
    fromMe: m.senderUserId === userId,
    senderUserId: m.senderUserId,
    senderLabel: m.senderTenantRef ? m.senderLabel ?? 'Member' : profiles.get(m.senderUserId)?.displayName ?? 'Contractor',
    fromTenant: Boolean(m.senderTenantRef),
    createdAt: m.createdAt.toISOString(),
  }))
}

// ── native (contractor) ────────────────────────────────────────────────────────────────
async function myParticipation(roomId: string, userId: string) {
  return prisma.roomParticipant.findFirst({ where: { roomId, kind: 'contractor', contractorUserId: userId, leftAt: null }, select: { joinedAt: true } })
}

/** The contractor's rooms (active participant), newest activity first. Direct → other's name; hire/team → org title. */
export async function listRooms(viewerUserId: string): Promise<RoomSummary[]> {
  const parts = await prisma.roomParticipant.findMany({ where: { kind: 'contractor', contractorUserId: viewerUserId, leftAt: null }, select: { roomId: true, joinedAt: true } })
  if (parts.length === 0) return []
  const joinedAt = new Map(parts.map((p) => [p.roomId, p.joinedAt]))
  const rooms = await prisma.room.findMany({
    where: { id: { in: parts.map((p) => p.roomId) } },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    take: 50,
    select: { id: true, kind: true, title: true, lastMessageAt: true, createdAt: true, participants: { where: { kind: 'contractor', leftAt: null }, select: { contractorUserId: true } } },
  })
  const otherOf = new Map(rooms.map((r) => [r.id, r.participants.map((p) => p.contractorUserId!).find((u) => u !== viewerUserId) ?? null]))
  const profiles = await profilesFor([...new Set([...otherOf.values()].filter((u): u is string => !!u))])
  return summarize(rooms, viewerUserId, joinedAt, (roomId) => {
    const r = rooms.find((x) => x.id === roomId)!
    if (r.kind === 'direct') {
      const p = otherOf.get(roomId) ? profiles.get(otherOf.get(roomId)!) : null
      return { title: p?.displayName ?? 'Contractor', avatarUrl: p?.avatarUrl ?? null }
    }
    return { title: r.title ?? 'Workspace', avatarUrl: null }
  })
}

/** Open (or reuse) a direct contractor↔contractor room — idempotent per the unordered pair. */
export async function openDirect(viewerUserId: string, otherUserId: string): Promise<{ roomId: string; other: Participant } | { error: string }> {
  if (viewerUserId === otherUserId) return { error: 'self' }
  const other = (await profilesFor([otherUserId])).get(otherUserId)
  if (!other) return { error: 'not_found' }
  const existing = await prisma.room.findFirst({
    where: { kind: 'direct', AND: [{ participants: { some: { contractorUserId: viewerUserId, leftAt: null } } }, { participants: { some: { contractorUserId: otherUserId, leftAt: null } } }] },
    select: { id: true },
  })
  if (existing) return { roomId: existing.id, other }
  const room = await prisma.room.create({
    data: { kind: 'direct', createdBy: viewerUserId, participants: { create: [{ kind: 'contractor', contractorUserId: viewerUserId }, { kind: 'contractor', contractorUserId: otherUserId }] } },
    select: { id: true },
  })
  return { roomId: room.id, other }
}

/** A room's messages for the contractor viewer (participant-gated, join-gated). Marks the room read. */
export async function listMessages(viewerUserId: string, roomId: string, limit = 50, before?: string): Promise<{ messages: RoomMsg[]; title: string; kind: Kind } | { error: string }> {
  const part = await myParticipation(roomId, viewerUserId)
  if (!part) return { error: 'forbidden' }
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { kind: true, title: true, participants: { where: { kind: 'contractor', leftAt: null }, select: { contractorUserId: true } } } })
  if (!room) return { error: 'not_found' }
  const otherId = room.kind === 'direct' ? room.participants.map((p) => p.contractorUserId!).find((u) => u !== viewerUserId) : null
  const title = room.kind === 'direct' ? (otherId ? (await profilesFor([otherId])).get(otherId)?.displayName ?? 'Contractor' : 'Contractor') : room.title ?? 'Workspace'
  const messages = await renderMessages(roomId, viewerUserId, part.joinedAt, limit, before)
  await setRead(viewerUserId, roomId)
  return { messages, title, kind: room.kind }
}

/** Send a message as the contractor (participant-gated). Bumps the room; emits room.message.sent. */
export async function send(viewerUserId: string, roomId: string, body: string): Promise<{ id: string } | { error: string }> {
  if (!(await myParticipation(roomId, viewerUserId))) return { error: 'forbidden' }
  const msg = await prisma.roomMessage.create({ data: { roomId, senderUserId: viewerUserId, body: body.trim() }, select: { id: true } })
  await prisma.room.update({ where: { id: roomId }, data: { lastMessageAt: new Date() } })
  await emit('dm', 'room.message.sent', viewerUserId, { roomId, messageId: msg.id }, 'contractor')
  return { id: msg.id }
}

/** Mark a room read for the contractor (participant-gated). */
export async function markRead(viewerUserId: string, roomId: string): Promise<{ ok: true } | { error: string }> {
  if (!(await myParticipation(roomId, viewerUserId))) return { error: 'forbidden' }
  await setRead(viewerUserId, roomId)
  return { ok: true }
}

/** Total unread across the contractor's rooms. */
export async function unreadCount(viewerUserId: string): Promise<number> {
  return (await listRooms(viewerUserId)).reduce((n, r) => n + r.unread, 0)
}

// ── provider (Board, service-key; tenant-ref-scoped) ─────────────────────────────────────
/** The room must carry a tenant participant matching `tenantRef` (the provider access gate). */
async function roomHasTenant(roomId: string, tenantRef: string): Promise<boolean> {
  return (await prisma.roomParticipant.findFirst({ where: { roomId, kind: 'tenant', tenantRef, leftAt: null }, select: { id: true } })) !== null
}

/** Open (or reuse) a hire room between a tenant and ONE contractor — idempotent per (tenantRef, contractor). */
export async function providerOpenHireRoom(input: { tenantRef: string; orgLabel: string; contractorUserId: string; boardRef?: string | null }): Promise<{ roomId: string }> {
  const existing = await prisma.room.findFirst({
    where: { kind: 'hire', AND: [{ participants: { some: { kind: 'tenant', tenantRef: input.tenantRef, leftAt: null } } }, { participants: { some: { kind: 'contractor', contractorUserId: input.contractorUserId, leftAt: null } } }] },
    select: { id: true },
  })
  if (existing) return { roomId: existing.id }
  const room = await prisma.room.create({
    data: {
      kind: 'hire',
      tenantRef: input.tenantRef,
      boardRef: input.boardRef ?? null,
      title: input.orgLabel,
      createdBy: `tenant:${input.tenantRef}`,
      participants: { create: [{ kind: 'tenant', tenantRef: input.tenantRef }, { kind: 'contractor', contractorUserId: input.contractorUserId }] },
    },
    select: { id: true },
  })
  return { roomId: room.id }
}

/** Open a team room: a tenant + multiple contractors. */
export async function providerOpenTeamRoom(input: { tenantRef: string; orgLabel: string; contractorUserIds: string[]; boardRef?: string | null; title?: string | null }): Promise<{ roomId: string }> {
  const contractors = [...new Set(input.contractorUserIds)].map((u) => ({ kind: 'contractor' as const, contractorUserId: u }))
  const room = await prisma.room.create({
    data: {
      kind: 'team',
      tenantRef: input.tenantRef,
      boardRef: input.boardRef ?? null,
      title: input.title?.trim() || input.orgLabel,
      createdBy: `tenant:${input.tenantRef}`,
      participants: { create: [{ kind: 'tenant', tenantRef: input.tenantRef }, ...contractors] },
    },
    select: { id: true },
  })
  return { roomId: room.id }
}

/** Add a contractor to a room (join-gated: they see only messages from joined_at on). Idempotent. */
export async function providerAddParticipant(input: { tenantRef: string; roomId: string; contractorUserId: string }): Promise<{ ok: true } | { error: string }> {
  if (!(await roomHasTenant(input.roomId, input.tenantRef))) return { error: 'forbidden' }
  const exists = await prisma.roomParticipant.findFirst({ where: { roomId: input.roomId, contractorUserId: input.contractorUserId, leftAt: null }, select: { id: true } })
  if (exists) return { ok: true }
  await prisma.roomParticipant.create({ data: { roomId: input.roomId, kind: 'contractor', contractorUserId: input.contractorUserId } })
  return { ok: true }
}

/** The tenant's rooms (hire/team) as seen by member `userId` — hire labeled by the contractor, team by its title. */
export async function providerListRooms(tenantRef: string, userId: string): Promise<RoomSummary[]> {
  const rooms = await prisma.room.findMany({
    where: { participants: { some: { kind: 'tenant', tenantRef, leftAt: null } } },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    take: 50,
    select: { id: true, kind: true, title: true, lastMessageAt: true, createdAt: true, participants: { where: { kind: 'contractor', leftAt: null }, select: { contractorUserId: true } } },
  })
  const profiles = await profilesFor([...new Set(rooms.flatMap((r) => r.participants.map((p) => p.contractorUserId!)))])
  const joinedAt = new Map(rooms.map((r) => [r.id, r.createdAt])) // tenant members see full history
  return summarize(rooms, userId, joinedAt, (roomId) => {
    const r = rooms.find((x) => x.id === roomId)!
    if (r.kind === 'team') return { title: r.title ?? 'Team', avatarUrl: null }
    const p = r.participants[0]?.contractorUserId ? profiles.get(r.participants[0].contractorUserId!) : null
    return { title: p?.displayName ?? 'Contractor', avatarUrl: p?.avatarUrl ?? null }
  })
}

/** A room's messages for tenant member `userId` (tenant-ref-gated). Marks read for that member. */
export async function providerListMessages(tenantRef: string, roomId: string, userId: string, before?: string): Promise<{ messages: RoomMsg[]; title: string; kind: Kind } | { error: string }> {
  if (!(await roomHasTenant(roomId, tenantRef))) return { error: 'forbidden' }
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { kind: true, title: true, participants: { where: { kind: 'contractor', leftAt: null }, select: { contractorUserId: true } } } })
  if (!room) return { error: 'not_found' }
  const cId = room.participants[0]?.contractorUserId ?? null
  const title = room.kind === 'team' ? room.title ?? 'Team' : cId ? (await profilesFor([cId])).get(cId)?.displayName ?? 'Contractor' : 'Contractor'
  const messages = await renderMessages(roomId, userId, new Date(0), 50, before) // tenant members see full history
  await setRead(userId, roomId)
  return { messages, title, kind: room.kind }
}

/** Send a message as a tenant member (tenant-ref-gated). Carries sender_tenant_ref + label for attribution. */
export async function providerSend(input: { tenantRef: string; roomId: string; senderUserId: string; senderLabel: string; body: string }): Promise<{ id: string } | { error: string }> {
  if (!(await roomHasTenant(input.roomId, input.tenantRef))) return { error: 'forbidden' }
  const msg = await prisma.roomMessage.create({ data: { roomId: input.roomId, senderUserId: input.senderUserId, senderTenantRef: input.tenantRef, senderLabel: input.senderLabel.trim() || null, body: input.body.trim() }, select: { id: true } })
  await prisma.room.update({ where: { id: input.roomId }, data: { lastMessageAt: new Date() } })
  await emit('dm', 'room.message.sent', input.senderUserId, { roomId: input.roomId, messageId: msg.id, via: 'board' }, 'client')
  return { id: msg.id }
}

/** Mark a room read for a tenant member (tenant-ref-gated). */
export async function providerMarkRead(tenantRef: string, roomId: string, userId: string): Promise<{ ok: true } | { error: string }> {
  if (!(await roomHasTenant(roomId, tenantRef))) return { error: 'forbidden' }
  await setRead(userId, roomId)
  return { ok: true }
}
