/**
 * charter store — the kickoff charter on a contract: the front-door alignment doc (goals / working agreement /
 * success criteria) + a close-out reflection. ONE per contract (singleton, keyed on contractId). Collaborative:
 * either party edits while in draft; an edit re-aligns acknowledgments (the editor's set true, the other reset);
 * both acknowledge → kicked off. At close, a shared close-out note + closedAt — the formal review stays in
 * ContractorReview (linked in the UI, not duplicated). Participant-scoped. Additive; touches only `charter`.
 */
import { prisma } from '@contractor/db'
import { emit } from '../../events'

type Role = 'client' | 'contractor'
type Status = 'draft' | 'active' | 'closed'
export type CharterInput = { goals?: string | null; workingAgreement?: string | null; successCriteria?: string | null }
export type CharterView = {
  goals: string | null
  workingAgreement: string | null
  successCriteria: string | null
  clientAcknowledged: boolean
  contractorAcknowledged: boolean
  lastEditedByRole: Role | null
  myRole: Role
  status: Status
  kickedOffAt: string | null
  closeOutNote: string | null
  closedAt: string | null
}

async function participant(contractId: string, userId: string): Promise<{ role: Role } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { clientUserId: true, contractorUserId: true } })
  if (!c) return { error: 'not_found' }
  if (c.clientUserId !== userId && c.contractorUserId !== userId) return { error: 'forbidden' }
  return { role: c.contractorUserId === userId ? 'contractor' : 'client' }
}

const clip = (s: unknown) => {
  const t = String(s ?? '').trim().slice(0, 4000)
  return t || null
}

type CharterRow = { goals: string | null; workingAgreement: string | null; successCriteria: string | null; clientAcknowledged: boolean; contractorAcknowledged: boolean; lastEditedByRole: string | null; kickedOffAt: Date | null; closeOutNote: string | null; closedAt: Date | null } | null

function toView(c: CharterRow, myRole: Role): CharterView {
  const status: Status = c?.closedAt ? 'closed' : c?.kickedOffAt ? 'active' : 'draft'
  return {
    goals: c?.goals ?? null,
    workingAgreement: c?.workingAgreement ?? null,
    successCriteria: c?.successCriteria ?? null,
    clientAcknowledged: c?.clientAcknowledged ?? false,
    contractorAcknowledged: c?.contractorAcknowledged ?? false,
    lastEditedByRole: (c?.lastEditedByRole as Role | null) ?? null,
    myRole,
    status,
    kickedOffAt: c?.kickedOffAt ? c.kickedOffAt.toISOString() : null,
    closeOutNote: c?.closeOutNote ?? null,
    closedAt: c?.closedAt ? c.closedAt.toISOString() : null,
  }
}

const SELECT = { goals: true, workingAgreement: true, successCriteria: true, clientAcknowledged: true, contractorAcknowledged: true, lastEditedByRole: true, kickedOffAt: true, closeOutNote: true, closedAt: true } as const

/** The charter for a contract (an empty draft view if none exists yet). */
export async function get(viewerUserId: string, contractId: string): Promise<CharterView | { error: string }> {
  const p = await participant(contractId, viewerUserId)
  if ('error' in p) return p
  const c = (await prisma.charter.findUnique({ where: { contractId }, select: SELECT })) as CharterRow
  return toView(c, p.role)
}

/** Save the charter doc (upsert). Editing re-aligns: the editor acknowledges, the other must re-acknowledge. */
export async function save(viewerUserId: string, contractId: string, input: CharterInput): Promise<{ ok: true } | { error: string }> {
  const p = await participant(contractId, viewerUserId)
  if ('error' in p) return p
  const existing = await prisma.charter.findUnique({ where: { contractId }, select: { closedAt: true } })
  if (existing?.closedAt) return { error: 'closed' }
  const fields = { goals: clip(input.goals), workingAgreement: clip(input.workingAgreement), successCriteria: clip(input.successCriteria) }
  const acks = p.role === 'contractor' ? { contractorAcknowledged: true, clientAcknowledged: false } : { clientAcknowledged: true, contractorAcknowledged: false }
  await prisma.charter.upsert({
    where: { contractId },
    create: { contractId, ...fields, lastEditedByRole: p.role, ...acks },
    update: { ...fields, lastEditedByRole: p.role, ...acks },
  })
  await emit('charter', 'charter.saved', viewerUserId, { contractId }, p.role)
  return { ok: true }
}

/** Acknowledge the charter; both acknowledged → kicked off. */
export async function acknowledge(viewerUserId: string, contractId: string): Promise<{ ok: true; kickedOff: boolean } | { error: string }> {
  const p = await participant(contractId, viewerUserId)
  if ('error' in p) return p
  const c = await prisma.charter.findUnique({ where: { contractId }, select: { clientAcknowledged: true, contractorAcknowledged: true, kickedOffAt: true, closedAt: true } })
  if (!c) return { error: 'no_charter' }
  if (c.closedAt) return { error: 'closed' }
  const clientAcknowledged = p.role === 'client' ? true : c.clientAcknowledged
  const contractorAcknowledged = p.role === 'contractor' ? true : c.contractorAcknowledged
  const kickedOff = clientAcknowledged && contractorAcknowledged
  await prisma.charter.update({ where: { contractId }, data: { clientAcknowledged, contractorAcknowledged, ...(kickedOff && !c.kickedOffAt ? { kickedOffAt: new Date() } : {}) } })
  await emit('charter', kickedOff ? 'charter.kicked_off' : 'charter.acknowledged', viewerUserId, { contractId }, p.role)
  return { ok: true, kickedOff: Boolean(kickedOff) }
}

/** Write / update the close-out reflection; sets closedAt on first close. Requires a kicked-off charter. */
export async function closeOut(viewerUserId: string, contractId: string, note: string): Promise<{ ok: true } | { error: string }> {
  const p = await participant(contractId, viewerUserId)
  if ('error' in p) return p
  const c = await prisma.charter.findUnique({ where: { contractId }, select: { kickedOffAt: true, closedAt: true } })
  if (!c) return { error: 'no_charter' }
  if (!c.kickedOffAt) return { error: 'not_kicked_off' }
  await prisma.charter.update({ where: { contractId }, data: { closeOutNote: clip(note), closedAt: c.closedAt ?? new Date() } })
  await emit('charter', 'charter.closed_out', viewerUserId, { contractId }, p.role)
  return { ok: true }
}

// ── provider (Board, service-key; acts as the CLIENT, boardRef-scoped) ───────────────────
async function providerGate(contractRef: string): Promise<{ ok: true } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractRef }, select: { boardRef: true } })
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  return { ok: true }
}

export async function providerGet(contractRef: string): Promise<CharterView | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const c = (await prisma.charter.findUnique({ where: { contractId: contractRef }, select: SELECT })) as CharterRow
  return toView(c, 'client')
}

export async function providerSave(contractRef: string, input: CharterInput): Promise<{ ok: true } | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const existing = await prisma.charter.findUnique({ where: { contractId: contractRef }, select: { closedAt: true } })
  if (existing?.closedAt) return { error: 'closed' }
  const fields = { goals: clip(input.goals), workingAgreement: clip(input.workingAgreement), successCriteria: clip(input.successCriteria) }
  await prisma.charter.upsert({
    where: { contractId: contractRef },
    create: { contractId: contractRef, ...fields, lastEditedByRole: 'client', clientAcknowledged: true, contractorAcknowledged: false },
    update: { ...fields, lastEditedByRole: 'client', clientAcknowledged: true, contractorAcknowledged: false },
  })
  await emit('charter', 'charter.saved', 'system', { contractId: contractRef }, 'client')
  return { ok: true }
}

export async function providerAcknowledge(contractRef: string): Promise<{ ok: true; kickedOff: boolean } | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const c = await prisma.charter.findUnique({ where: { contractId: contractRef }, select: { contractorAcknowledged: true, kickedOffAt: true, closedAt: true } })
  if (!c) return { error: 'no_charter' }
  if (c.closedAt) return { error: 'closed' }
  const kickedOff = c.contractorAcknowledged // client acknowledges here
  await prisma.charter.update({ where: { contractId: contractRef }, data: { clientAcknowledged: true, ...(kickedOff && !c.kickedOffAt ? { kickedOffAt: new Date() } : {}) } })
  await emit('charter', kickedOff ? 'charter.kicked_off' : 'charter.acknowledged', 'system', { contractId: contractRef }, 'client')
  return { ok: true, kickedOff: Boolean(kickedOff) }
}

export async function providerCloseOut(contractRef: string, note: string): Promise<{ ok: true } | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const c = await prisma.charter.findUnique({ where: { contractId: contractRef }, select: { kickedOffAt: true, closedAt: true } })
  if (!c) return { error: 'no_charter' }
  if (!c.kickedOffAt) return { error: 'not_kicked_off' }
  await prisma.charter.update({ where: { contractId: contractRef }, data: { closeOutNote: clip(note), closedAt: c.closedAt ?? new Date() } })
  await emit('charter', 'charter.closed_out', 'system', { contractId: contractRef }, 'client')
  return { ok: true }
}
