/**
 * blocker store — a stalled-work flag on a contract. Either participant raises a blocker (the contractor is
 * waiting on the client, or an impediment is flagged); either participant resolves it. While ANY blocker is
 * open, billable clock is paused — the [createdAt, resolvedAt] interval is the paused window (the billing/timer
 * exclusion ties in later). Participant-scoped; the role is derived from the contract. Additive — touches only
 * the `blocker` table, never the charge path. Raw prisma + app-layer scoping.
 */
import { prisma } from '@contractor/db'
import { emit } from '../../events'

type Role = 'client' | 'contractor'
export type BlockerView = {
  id: string
  status: 'open' | 'resolved'
  reason: string
  raisedByRole: Role
  resolutionNote: string | null
  resolvedByRole: Role | null
  createdAt: string
  resolvedAt: string | null
  fromMe: boolean
}

async function participantRole(contractId: string, userId: string): Promise<{ role: Role } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { clientUserId: true, contractorUserId: true } })
  if (!c) return { error: 'not_found' }
  if (c.clientUserId !== userId && c.contractorUserId !== userId) return { error: 'forbidden' }
  return { role: c.contractorUserId === userId ? 'contractor' : 'client' }
}

function toView(b: { id: string; status: string; reason: string; raisedByRole: string; raisedByUserId: string; resolutionNote: string | null; resolvedByRole: string | null; createdAt: Date; resolvedAt: Date | null }, viewerUserId: string): BlockerView {
  return {
    id: b.id,
    status: b.status as 'open' | 'resolved',
    reason: b.reason,
    raisedByRole: b.raisedByRole as Role,
    resolutionNote: b.resolutionNote,
    resolvedByRole: (b.resolvedByRole as Role | null) ?? null,
    createdAt: b.createdAt.toISOString(),
    resolvedAt: b.resolvedAt ? b.resolvedAt.toISOString() : null,
    fromMe: b.raisedByUserId === viewerUserId,
  }
}

const SELECT = { id: true, status: true, reason: true, raisedByRole: true, raisedByUserId: true, resolutionNote: true, resolvedByRole: true, createdAt: true, resolvedAt: true } as const

export async function list(viewerUserId: string, contractId: string): Promise<BlockerView[] | { error: string }> {
  const p = await participantRole(contractId, viewerUserId)
  if ('error' in p) return p
  const rows = await prisma.blocker.findMany({ where: { contractId }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 100, select: SELECT })
  return rows.map((r) => toView(r, viewerUserId))
}

export async function raise(viewerUserId: string, contractId: string, input: { reason: string; sprintId?: string | null }): Promise<{ id: string } | { error: string }> {
  const p = await participantRole(contractId, viewerUserId)
  if ('error' in p) return p
  const reason = String(input.reason ?? '').trim().slice(0, 2000)
  if (!reason) return { error: 'no_reason' }
  const b = await prisma.blocker.create({
    data: { contractId, sprintId: input.sprintId ?? null, reason, raisedByRole: p.role, raisedByUserId: viewerUserId },
    select: { id: true },
  })
  await emit('blocker', 'blocker.raised', viewerUserId, { contractId, blockerId: b.id }, p.role)
  return { id: b.id }
}

export async function resolve(viewerUserId: string, blockerId: string, note: string): Promise<{ ok: true } | { error: string }> {
  const b = await prisma.blocker.findUnique({ where: { id: blockerId }, select: { contractId: true, status: true } })
  if (!b) return { error: 'not_found' }
  if (b.status !== 'open') return { error: 'not_open' }
  const p = await participantRole(b.contractId, viewerUserId)
  if ('error' in p) return p
  await prisma.blocker.update({ where: { id: blockerId }, data: { status: 'resolved', resolvedAt: new Date(), resolvedByRole: p.role, resolutionNote: String(note ?? '').trim().slice(0, 2000) || null } })
  await emit('blocker', 'blocker.resolved', viewerUserId, { contractId: b.contractId, blockerId }, p.role)
  return { ok: true }
}

// ── provider (Board, service-key; acts as the CLIENT, boardRef-scoped) ───────────────────
async function providerGate(contractRef: string): Promise<{ ok: true } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractRef }, select: { boardRef: true } })
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  return { ok: true }
}

export async function providerList(contractRef: string): Promise<BlockerView[] | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const rows = await prisma.blocker.findMany({ where: { contractId: contractRef }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 100, select: SELECT })
  // The Board side is always the client; mark fromMe for blockers the client raised.
  return rows.map((r) => ({ ...toView(r, ''), fromMe: r.raisedByRole === 'client' }))
}

export async function providerRaise(contractRef: string, reason: string): Promise<{ id: string } | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const r = String(reason ?? '').trim().slice(0, 2000)
  if (!r) return { error: 'no_reason' }
  const b = await prisma.blocker.create({ data: { contractId: contractRef, reason: r, raisedByRole: 'client', raisedByUserId: 'board' }, select: { id: true } })
  await emit('blocker', 'blocker.raised', 'system', { contractId: contractRef, blockerId: b.id }, 'client')
  return { id: b.id }
}

export async function providerResolve(contractRef: string, blockerId: string, note: string): Promise<{ ok: true } | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const b = await prisma.blocker.findFirst({ where: { id: blockerId, contractId: contractRef }, select: { status: true } })
  if (!b) return { error: 'not_found' }
  if (b.status !== 'open') return { error: 'not_open' }
  await prisma.blocker.update({ where: { id: blockerId }, data: { status: 'resolved', resolvedAt: new Date(), resolvedByRole: 'client', resolutionNote: String(note ?? '').trim().slice(0, 2000) || null } })
  await emit('blocker', 'blocker.resolved', 'system', { contractId: contractRef, blockerId }, 'client')
  return { ok: true }
}
