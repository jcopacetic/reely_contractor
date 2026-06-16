/**
 * change-request store — a mid-flight contract amendment (scope / rate / timeline / other) that BOTH parties
 * negotiate to agreement. Same counter-edit game as a sprint: an edit by either side resets the other's
 * approval; both-approved → agreed. A `rate` change records the proposed new rate but does NOT mutate the
 * contract/billing — enactment (writing appliedAt + applying the rate) is a deferred, fenced step. Participant-
 * scoped; the role is derived from the contract. Additive — touches only the `change_request` table.
 */
import { prisma, type Prisma } from '@contractor/db'
import { emit } from '../../events'

type Role = 'client' | 'contractor'
type Status = 'proposed' | 'agreed' | 'withdrawn'
type Kind = 'scope' | 'rate' | 'timeline' | 'other'
type RateType = 'hourly' | 'fixed'

export type ChangeRequestInput = { kind: Kind; title: string; detail: string; proposedRateType?: RateType | null; proposedRateAmount?: number | null }
export type ChangeRequestView = {
  id: string
  kind: Kind
  title: string
  detail: string
  proposedRateType: RateType | null
  proposedRateAmount: number | null
  status: Status
  clientApproved: boolean
  contractorApproved: boolean
  lastEditedByRole: Role
  myRole: Role
  appliedAt: string | null
  createdAt: string
  agreedAt: string | null
}

async function participant(contractId: string, userId: string): Promise<{ role: Role } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { clientUserId: true, contractorUserId: true } })
  if (!c) return { error: 'not_found' }
  if (c.clientUserId !== userId && c.contractorUserId !== userId) return { error: 'forbidden' }
  return { role: c.contractorUserId === userId ? 'contractor' : 'client' }
}

/** The acting role approves their version; the other side un-approves (a change requires re-approval). */
function applyApprovals(role: Role): { clientApproved: boolean; contractorApproved: boolean } {
  return role === 'contractor' ? { contractorApproved: true, clientApproved: false } : { clientApproved: true, contractorApproved: false }
}

/** Normalize an input — rate fields only survive for kind='rate' (and must be a positive amount + a type). */
function clean(input: ChangeRequestInput): { kind: Kind; title: string; detail: string; proposedRateType: RateType | null; proposedRateAmount: number | null } | { error: string } {
  const kind = (['scope', 'rate', 'timeline', 'other'] as const).includes(input.kind) ? input.kind : 'other'
  const title = String(input.title ?? '').trim().slice(0, 200)
  const detail = String(input.detail ?? '').trim().slice(0, 4000)
  if (!title || !detail) return { error: 'incomplete' }
  if (kind === 'rate') {
    const t = input.proposedRateType === 'fixed' ? 'fixed' : input.proposedRateType === 'hourly' ? 'hourly' : null
    const amt = Number(input.proposedRateAmount)
    if (!t || !Number.isFinite(amt) || amt <= 0) return { error: 'rate_required' }
    return { kind, title, detail, proposedRateType: t, proposedRateAmount: Math.round(amt * 100) / 100 }
  }
  return { kind, title, detail, proposedRateType: null, proposedRateAmount: null }
}

function toView(c: { id: string; kind: string; title: string; detail: string; proposedRateType: string | null; proposedRateAmount: Prisma.Decimal | null; status: string; clientApproved: boolean; contractorApproved: boolean; lastEditedByRole: string; appliedAt: Date | null; createdAt: Date; agreedAt: Date | null }, myRole: Role): ChangeRequestView {
  return {
    id: c.id,
    kind: c.kind as Kind,
    title: c.title,
    detail: c.detail,
    proposedRateType: (c.proposedRateType as RateType | null) ?? null,
    proposedRateAmount: c.proposedRateAmount != null ? Number(c.proposedRateAmount) : null,
    status: c.status as Status,
    clientApproved: c.clientApproved,
    contractorApproved: c.contractorApproved,
    lastEditedByRole: c.lastEditedByRole as Role,
    myRole,
    appliedAt: c.appliedAt ? c.appliedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    agreedAt: c.agreedAt ? c.agreedAt.toISOString() : null,
  }
}

export async function list(viewerUserId: string, contractId: string): Promise<ChangeRequestView[] | { error: string }> {
  const p = await participant(contractId, viewerUserId)
  if ('error' in p) return p
  const rows = await prisma.changeRequest.findMany({ where: { contractId }, orderBy: { createdAt: 'desc' }, take: 100 })
  return rows.map((r) => toView(r, p.role))
}

export async function propose(viewerUserId: string, contractId: string, input: ChangeRequestInput): Promise<{ id: string } | { error: string }> {
  const p = await participant(contractId, viewerUserId)
  if ('error' in p) return p
  const c = clean(input)
  if ('error' in c) return c
  const cr = await prisma.changeRequest.create({
    data: { contractId, kind: c.kind, title: c.title, detail: c.detail, proposedRateType: c.proposedRateType, proposedRateAmount: c.proposedRateAmount, lastEditedByRole: p.role, ...applyApprovals(p.role) },
    select: { id: true },
  })
  await emit('change-request', 'change_request.proposed', viewerUserId, { contractId, changeRequestId: cr.id }, p.role)
  return { id: cr.id }
}

export async function edit(viewerUserId: string, crId: string, input: ChangeRequestInput): Promise<{ ok: true } | { error: string }> {
  const cr = await prisma.changeRequest.findUnique({ where: { id: crId }, select: { contractId: true, status: true } })
  if (!cr) return { error: 'not_found' }
  if (cr.status !== 'proposed') return { error: 'not_editable' }
  const p = await participant(cr.contractId, viewerUserId)
  if ('error' in p) return p
  const c = clean(input)
  if ('error' in c) return c
  await prisma.changeRequest.update({ where: { id: crId }, data: { kind: c.kind, title: c.title, detail: c.detail, proposedRateType: c.proposedRateType, proposedRateAmount: c.proposedRateAmount, lastEditedByRole: p.role, ...applyApprovals(p.role) } })
  await emit('change-request', 'change_request.edited', viewerUserId, { changeRequestId: crId }, p.role)
  return { ok: true }
}

export async function approve(viewerUserId: string, crId: string): Promise<{ ok: true; agreed: boolean } | { error: string }> {
  const cr = await prisma.changeRequest.findUnique({ where: { id: crId }, select: { contractId: true, status: true, clientApproved: true, contractorApproved: true } })
  if (!cr) return { error: 'not_found' }
  if (cr.status !== 'proposed') return { error: 'not_proposed' }
  const p = await participant(cr.contractId, viewerUserId)
  if ('error' in p) return p
  const clientApproved = p.role === 'client' ? true : cr.clientApproved
  const contractorApproved = p.role === 'contractor' ? true : cr.contractorApproved
  const agreed = clientApproved && contractorApproved
  await prisma.changeRequest.update({ where: { id: crId }, data: { clientApproved, contractorApproved, ...(agreed ? { status: 'agreed', agreedAt: new Date() } : {}) } })
  await emit('change-request', agreed ? 'change_request.agreed' : 'change_request.approved', viewerUserId, { changeRequestId: crId }, p.role)
  return { ok: true, agreed }
}

export async function withdraw(viewerUserId: string, crId: string): Promise<{ ok: true } | { error: string }> {
  const cr = await prisma.changeRequest.findUnique({ where: { id: crId }, select: { contractId: true, status: true } })
  if (!cr) return { error: 'not_found' }
  if (cr.status !== 'proposed') return { error: 'not_withdrawable' }
  const p = await participant(cr.contractId, viewerUserId)
  if ('error' in p) return p
  await prisma.changeRequest.update({ where: { id: crId }, data: { status: 'withdrawn' } })
  await emit('change-request', 'change_request.withdrawn', viewerUserId, { changeRequestId: crId }, p.role)
  return { ok: true }
}

// ── provider (Board, service-key; acts as the CLIENT, boardRef-scoped) ───────────────────
async function providerGate(contractRef: string): Promise<{ ok: true } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractRef }, select: { boardRef: true } })
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  return { ok: true }
}

export async function providerList(contractRef: string): Promise<ChangeRequestView[] | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const rows = await prisma.changeRequest.findMany({ where: { contractId: contractRef }, orderBy: { createdAt: 'desc' }, take: 100 })
  return rows.map((r) => toView(r, 'client'))
}

export async function providerPropose(contractRef: string, input: ChangeRequestInput): Promise<{ id: string } | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const c = clean(input)
  if ('error' in c) return c
  const cr = await prisma.changeRequest.create({ data: { contractId: contractRef, kind: c.kind, title: c.title, detail: c.detail, proposedRateType: c.proposedRateType, proposedRateAmount: c.proposedRateAmount, lastEditedByRole: 'client', ...applyApprovals('client') }, select: { id: true } })
  await emit('change-request', 'change_request.proposed', 'system', { contractId: contractRef, changeRequestId: cr.id }, 'client')
  return { id: cr.id }
}

export async function providerEdit(contractRef: string, crId: string, input: ChangeRequestInput): Promise<{ ok: true } | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const cr = await prisma.changeRequest.findFirst({ where: { id: crId, contractId: contractRef }, select: { status: true } })
  if (!cr) return { error: 'not_found' }
  if (cr.status !== 'proposed') return { error: 'not_editable' }
  const c = clean(input)
  if ('error' in c) return c
  await prisma.changeRequest.update({ where: { id: crId }, data: { kind: c.kind, title: c.title, detail: c.detail, proposedRateType: c.proposedRateType, proposedRateAmount: c.proposedRateAmount, lastEditedByRole: 'client', ...applyApprovals('client') } })
  await emit('change-request', 'change_request.edited', 'system', { changeRequestId: crId }, 'client')
  return { ok: true }
}

export async function providerApprove(contractRef: string, crId: string): Promise<{ ok: true; agreed: boolean } | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const cr = await prisma.changeRequest.findFirst({ where: { id: crId, contractId: contractRef }, select: { status: true, contractorApproved: true } })
  if (!cr) return { error: 'not_found' }
  if (cr.status !== 'proposed') return { error: 'not_proposed' }
  const agreed = cr.contractorApproved
  await prisma.changeRequest.update({ where: { id: crId }, data: { clientApproved: true, ...(agreed ? { status: 'agreed', agreedAt: new Date() } : {}) } })
  await emit('change-request', agreed ? 'change_request.agreed' : 'change_request.approved', 'system', { changeRequestId: crId }, 'client')
  return { ok: true, agreed }
}

export async function providerWithdraw(contractRef: string, crId: string): Promise<{ ok: true } | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const cr = await prisma.changeRequest.findFirst({ where: { id: crId, contractId: contractRef }, select: { status: true } })
  if (!cr) return { error: 'not_found' }
  if (cr.status !== 'proposed') return { error: 'not_withdrawable' }
  await prisma.changeRequest.update({ where: { id: crId }, data: { status: 'withdrawn' } })
  await emit('change-request', 'change_request.withdrawn', 'system', { changeRequestId: crId }, 'client')
  return { ok: true }
}
