/**
 * sprint store — agile sprints on a contract: a two-party-negotiated collection of tasks + a time-to-deliver.
 * Either party proposes; an edit by either side resets the OTHER's approval (the counter-edit game); both
 * approved → agreed. Effort points (≈ hours) sum to the expected billed time → × the rate = the expected
 * budget (live, no guesswork). Participant-scoped; the role is derived from the contract. Additive — touches
 * only the `sprint` table, never the charge path. Raw prisma + app-layer scoping.
 */
import { prisma, type Prisma } from '@contractor/db'
import { emit } from '../../events'

type Role = 'client' | 'contractor'
type Status = 'proposed' | 'agreed' | 'completed' | 'cancelled'
export type SprintItem = { title: string; effortPoints: number }
export type SprintView = {
  id: string
  status: Status
  ttdDays: number
  items: SprintItem[]
  expectedHours: number
  expectedBudget: number | null // hourly contracts only (Σ hours × rate); null for fixed-rate
  clientApproved: boolean
  contractorApproved: boolean
  lastEditedByRole: Role
  myRole: Role
  createdAt: string
  agreedAt: string | null
}

const MAX_ITEMS = 50

function sanitizeItems(raw: unknown): SprintItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => {
      const o = x as { title?: unknown; effortPoints?: unknown }
      const title = String(o.title ?? '').trim().slice(0, 200)
      const pts = Math.round(Number(o.effortPoints ?? 0))
      return title ? { title, effortPoints: Number.isFinite(pts) ? Math.max(0, Math.min(1000, pts)) : 0 } : null
    })
    .filter((x): x is SprintItem => x !== null)
    .slice(0, MAX_ITEMS)
}

async function participant(contractId: string, userId: string): Promise<{ role: Role; rateType: string; rateAmount: number } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { clientUserId: true, contractorUserId: true, rateType: true, rateAmount: true } })
  if (!c) return { error: 'not_found' }
  if (c.clientUserId !== userId && c.contractorUserId !== userId) return { error: 'forbidden' }
  return { role: c.contractorUserId === userId ? 'contractor' : 'client', rateType: c.rateType as string, rateAmount: Number(c.rateAmount) }
}

/** The acting role approves their version; the other side un-approves (a change requires re-approval). */
function applyApprovals(role: Role): { clientApproved: boolean; contractorApproved: boolean } {
  return role === 'contractor' ? { contractorApproved: true, clientApproved: false } : { clientApproved: true, contractorApproved: false }
}

function toView(s: { id: string; status: string; ttdDays: number; items: unknown; clientApproved: boolean; contractorApproved: boolean; lastEditedByRole: string; createdAt: Date; agreedAt: Date | null }, myRole: Role, rateType: string, rateAmount: number): SprintView {
  const items = sanitizeItems(s.items)
  const expectedHours = items.reduce((n, i) => n + i.effortPoints, 0)
  return {
    id: s.id,
    status: s.status as Status,
    ttdDays: s.ttdDays,
    items,
    expectedHours,
    expectedBudget: rateType === 'hourly' ? Math.round(expectedHours * rateAmount * 100) / 100 : null,
    clientApproved: s.clientApproved,
    contractorApproved: s.contractorApproved,
    lastEditedByRole: s.lastEditedByRole as Role,
    myRole,
    createdAt: s.createdAt.toISOString(),
    agreedAt: s.agreedAt ? s.agreedAt.toISOString() : null,
  }
}

export async function list(viewerUserId: string, contractId: string): Promise<SprintView[] | { error: string }> {
  const p = await participant(contractId, viewerUserId)
  if ('error' in p) return p
  const rows = await prisma.sprint.findMany({ where: { contractId }, orderBy: { createdAt: 'desc' }, take: 100 })
  return rows.map((r) => toView(r, p.role, p.rateType, p.rateAmount))
}

const ttdOf = (n: number) => Math.max(1, Math.min(365, Math.round(n)))

export async function propose(viewerUserId: string, contractId: string, input: { items: SprintItem[]; ttdDays: number }): Promise<{ id: string } | { error: string }> {
  const p = await participant(contractId, viewerUserId)
  if ('error' in p) return p
  const items = sanitizeItems(input.items)
  if (items.length === 0) return { error: 'no_items' }
  const s = await prisma.sprint.create({
    data: { contractId, ttdDays: ttdOf(input.ttdDays), items: items as unknown as Prisma.InputJsonValue, lastEditedByRole: p.role, ...applyApprovals(p.role) },
    select: { id: true },
  })
  await emit('sprint', 'sprint.proposed', viewerUserId, { contractId, sprintId: s.id }, p.role)
  return { id: s.id }
}

export async function edit(viewerUserId: string, sprintId: string, input: { items: SprintItem[]; ttdDays: number }): Promise<{ ok: true } | { error: string }> {
  const s = await prisma.sprint.findUnique({ where: { id: sprintId }, select: { contractId: true, status: true } })
  if (!s) return { error: 'not_found' }
  if (s.status !== 'proposed') return { error: 'not_editable' }
  const p = await participant(s.contractId, viewerUserId)
  if ('error' in p) return p
  const items = sanitizeItems(input.items)
  if (items.length === 0) return { error: 'no_items' }
  await prisma.sprint.update({ where: { id: sprintId }, data: { items: items as unknown as Prisma.InputJsonValue, ttdDays: ttdOf(input.ttdDays), lastEditedByRole: p.role, ...applyApprovals(p.role) } })
  await emit('sprint', 'sprint.edited', viewerUserId, { sprintId }, p.role)
  return { ok: true }
}

export async function approve(viewerUserId: string, sprintId: string): Promise<{ ok: true; agreed: boolean } | { error: string }> {
  const s = await prisma.sprint.findUnique({ where: { id: sprintId }, select: { contractId: true, status: true, clientApproved: true, contractorApproved: true } })
  if (!s) return { error: 'not_found' }
  if (s.status !== 'proposed') return { error: 'not_proposed' }
  const p = await participant(s.contractId, viewerUserId)
  if ('error' in p) return p
  const clientApproved = p.role === 'client' ? true : s.clientApproved
  const contractorApproved = p.role === 'contractor' ? true : s.contractorApproved
  const agreed = clientApproved && contractorApproved
  await prisma.sprint.update({ where: { id: sprintId }, data: { clientApproved, contractorApproved, ...(agreed ? { status: 'agreed', agreedAt: new Date() } : {}) } })
  await emit('sprint', agreed ? 'sprint.agreed' : 'sprint.approved', viewerUserId, { sprintId }, p.role)
  return { ok: true, agreed }
}

export async function cancel(viewerUserId: string, sprintId: string): Promise<{ ok: true } | { error: string }> {
  const s = await prisma.sprint.findUnique({ where: { id: sprintId }, select: { contractId: true, status: true } })
  if (!s) return { error: 'not_found' }
  if (s.status !== 'proposed') return { error: 'not_cancellable' }
  const p = await participant(s.contractId, viewerUserId)
  if ('error' in p) return p
  await prisma.sprint.update({ where: { id: sprintId }, data: { status: 'cancelled' } })
  return { ok: true }
}
