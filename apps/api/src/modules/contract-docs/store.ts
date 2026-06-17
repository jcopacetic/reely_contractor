/**
 * contract-docs store — optional agreement documents attached to a contract (NDA / IP assignment / confidentiality
 * / IC agreement / non-solicit / custom). A participant adds one (from a web template or custom text); the ADDER
 * edits/removes it while it's UNSIGNED; both parties e-sign with a typed name + timestamp (the audit trail). Once
 * anyone signs, the body locks; executed = both signed. Participant-scoped; role derived from the contract.
 */
import { prisma } from '@contractor/db'
import { emit } from '../../events'

type Role = 'client' | 'contractor'
type Kind = 'nda' | 'ip_assignment' | 'confidentiality' | 'ic_agreement' | 'non_solicit' | 'custom'
export type DocInput = { kind: Kind; title: string; body: string }

export type DocView = {
  id: string
  kind: Kind
  title: string
  body: string
  addedByRole: Role
  myRole: Role
  clientSigned: boolean
  clientSignerName: string | null
  clientSignedAt: string | null
  contractorSigned: boolean
  contractorSignerName: string | null
  contractorSignedAt: string | null
  executed: boolean
  locked: boolean // any signature present → body can no longer be edited
  createdAt: string
}

async function participant(contractId: string, userId: string): Promise<{ role: Role } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { clientUserId: true, contractorUserId: true } })
  if (!c) return { error: 'not_found' }
  if (c.clientUserId !== userId && c.contractorUserId !== userId) return { error: 'forbidden' }
  return { role: c.contractorUserId === userId ? 'contractor' : 'client' }
}

const KINDS: Kind[] = ['nda', 'ip_assignment', 'confidentiality', 'ic_agreement', 'non_solicit', 'custom']
const clean = (input: DocInput): { kind: Kind; title: string; body: string } | { error: string } => {
  const kind = KINDS.includes(input.kind) ? input.kind : 'custom'
  const title = String(input.title ?? '').trim().slice(0, 200)
  const body = String(input.body ?? '').trim().slice(0, 50_000)
  if (!title || !body) return { error: 'incomplete' }
  return { kind, title, body }
}

type Row = { id: string; kind: string; title: string; body: string; addedByRole: string; clientSignedAt: Date | null; clientSignerName: string | null; contractorSignedAt: Date | null; contractorSignerName: string | null; createdAt: Date }
function toView(d: Row, myRole: Role): DocView {
  const clientSigned = d.clientSignedAt != null
  const contractorSigned = d.contractorSignedAt != null
  return {
    id: d.id,
    kind: d.kind as Kind,
    title: d.title,
    body: d.body,
    addedByRole: d.addedByRole as Role,
    myRole,
    clientSigned,
    clientSignerName: d.clientSignerName,
    clientSignedAt: d.clientSignedAt ? d.clientSignedAt.toISOString() : null,
    contractorSigned,
    contractorSignerName: d.contractorSignerName,
    contractorSignedAt: d.contractorSignedAt ? d.contractorSignedAt.toISOString() : null,
    executed: clientSigned && contractorSigned,
    locked: clientSigned || contractorSigned,
    createdAt: d.createdAt.toISOString(),
  }
}

const SELECT = { id: true, kind: true, title: true, body: true, addedByRole: true, clientSignedAt: true, clientSignerName: true, contractorSignedAt: true, contractorSignerName: true, createdAt: true } as const

export async function list(viewerUserId: string, contractId: string): Promise<DocView[] | { error: string }> {
  const p = await participant(contractId, viewerUserId)
  if ('error' in p) return p
  const rows = await prisma.contractDoc.findMany({ where: { contractId }, orderBy: { createdAt: 'asc' }, take: 50, select: SELECT })
  return rows.map((r) => toView(r, p.role))
}

export async function add(viewerUserId: string, contractId: string, input: DocInput): Promise<{ id: string } | { error: string }> {
  const p = await participant(contractId, viewerUserId)
  if ('error' in p) return p
  const c = clean(input)
  if ('error' in c) return c
  const d = await prisma.contractDoc.create({ data: { contractId, kind: c.kind, title: c.title, body: c.body, addedByRole: p.role }, select: { id: true } })
  await emit('contract-docs', 'doc.added', viewerUserId, { contractId, docId: d.id, kind: c.kind }, p.role)
  return { id: d.id }
}

export async function edit(viewerUserId: string, docId: string, input: DocInput): Promise<{ ok: true } | { error: string }> {
  const d = await prisma.contractDoc.findUnique({ where: { id: docId }, select: { contractId: true, addedByRole: true, clientSignedAt: true, contractorSignedAt: true } })
  if (!d) return { error: 'not_found' }
  if (d.clientSignedAt || d.contractorSignedAt) return { error: 'locked' } // a signed doc can't be edited
  const p = await participant(d.contractId, viewerUserId)
  if ('error' in p) return p
  if (p.role !== d.addedByRole) return { error: 'forbidden' } // only the adder edits
  const c = clean(input)
  if ('error' in c) return c
  await prisma.contractDoc.update({ where: { id: docId }, data: { kind: c.kind, title: c.title, body: c.body } })
  await emit('contract-docs', 'doc.edited', viewerUserId, { docId }, p.role)
  return { ok: true }
}

export async function remove(viewerUserId: string, docId: string): Promise<{ ok: true } | { error: string }> {
  const d = await prisma.contractDoc.findUnique({ where: { id: docId }, select: { contractId: true, addedByRole: true, clientSignedAt: true, contractorSignedAt: true } })
  if (!d) return { error: 'not_found' }
  if (d.clientSignedAt && d.contractorSignedAt) return { error: 'executed' } // a fully-signed doc is permanent
  const p = await participant(d.contractId, viewerUserId)
  if ('error' in p) return p
  if (p.role !== d.addedByRole) return { error: 'forbidden' }
  await prisma.contractDoc.delete({ where: { id: docId } })
  await emit('contract-docs', 'doc.removed', viewerUserId, { docId }, p.role)
  return { ok: true }
}

/** A participant e-signs the doc with their typed name. Records their side's signedAt; both → executed. */
export async function sign(viewerUserId: string, docId: string, signerName: string): Promise<{ ok: true; executed: boolean } | { error: string }> {
  const name = String(signerName ?? '').trim().slice(0, 200)
  if (!name) return { error: 'name_required' }
  const d = await prisma.contractDoc.findUnique({ where: { id: docId }, select: { contractId: true, clientSignedAt: true, contractorSignedAt: true } })
  if (!d) return { error: 'not_found' }
  const p = await participant(d.contractId, viewerUserId)
  if ('error' in p) return p
  const mine = p.role === 'client' ? d.clientSignedAt : d.contractorSignedAt
  if (mine) return { error: 'already_signed' }
  const now = new Date()
  const data = p.role === 'client' ? { clientSignedAt: now, clientSignerName: name } : { contractorSignedAt: now, contractorSignerName: name }
  await prisma.contractDoc.update({ where: { id: docId }, data })
  const executed = p.role === 'client' ? Boolean(d.contractorSignedAt) : Boolean(d.clientSignedAt)
  await emit('contract-docs', executed ? 'doc.executed' : 'doc.signed', viewerUserId, { contractId: d.contractId, docId }, p.role)
  return { ok: true, executed }
}

// ── provider (Board client; acts as the client role; boardRef-scoped) ─────────────────────
async function providerGate(contractRef: string): Promise<{ ok: true } | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractRef }, select: { boardRef: true } })
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  return { ok: true }
}

export async function providerList(contractRef: string): Promise<DocView[] | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const rows = await prisma.contractDoc.findMany({ where: { contractId: contractRef }, orderBy: { createdAt: 'asc' }, take: 50, select: SELECT })
  return rows.map((r) => toView(r, 'client'))
}

export async function providerAdd(contractRef: string, input: DocInput): Promise<{ id: string } | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const c = clean(input)
  if ('error' in c) return c
  const d = await prisma.contractDoc.create({ data: { contractId: contractRef, kind: c.kind, title: c.title, body: c.body, addedByRole: 'client' }, select: { id: true } })
  await emit('contract-docs', 'doc.added', 'system', { contractId: contractRef, docId: d.id, kind: c.kind }, 'client')
  return { id: d.id }
}

export async function providerEdit(contractRef: string, docId: string, input: DocInput): Promise<{ ok: true } | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const d = await prisma.contractDoc.findFirst({ where: { id: docId, contractId: contractRef }, select: { addedByRole: true, clientSignedAt: true, contractorSignedAt: true } })
  if (!d) return { error: 'not_found' }
  if (d.clientSignedAt || d.contractorSignedAt) return { error: 'locked' }
  if (d.addedByRole !== 'client') return { error: 'forbidden' }
  const c = clean(input)
  if ('error' in c) return c
  await prisma.contractDoc.update({ where: { id: docId }, data: { kind: c.kind, title: c.title, body: c.body } })
  await emit('contract-docs', 'doc.edited', 'system', { docId }, 'client')
  return { ok: true }
}

export async function providerRemove(contractRef: string, docId: string): Promise<{ ok: true } | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const d = await prisma.contractDoc.findFirst({ where: { id: docId, contractId: contractRef }, select: { addedByRole: true, clientSignedAt: true, contractorSignedAt: true } })
  if (!d) return { error: 'not_found' }
  if (d.clientSignedAt && d.contractorSignedAt) return { error: 'executed' }
  if (d.addedByRole !== 'client') return { error: 'forbidden' }
  await prisma.contractDoc.delete({ where: { id: docId } })
  await emit('contract-docs', 'doc.removed', 'system', { docId }, 'client')
  return { ok: true }
}

export async function providerSign(contractRef: string, docId: string, signerName: string): Promise<{ ok: true; executed: boolean } | { error: string }> {
  const g = await providerGate(contractRef)
  if ('error' in g) return g
  const name = String(signerName ?? '').trim().slice(0, 200)
  if (!name) return { error: 'name_required' }
  const d = await prisma.contractDoc.findFirst({ where: { id: docId, contractId: contractRef }, select: { clientSignedAt: true, contractorSignedAt: true } })
  if (!d) return { error: 'not_found' }
  if (d.clientSignedAt) return { error: 'already_signed' } // the Board acts as the client
  await prisma.contractDoc.update({ where: { id: docId }, data: { clientSignedAt: new Date(), clientSignerName: name } })
  const executed = Boolean(d.contractorSignedAt)
  await emit('contract-docs', executed ? 'doc.executed' : 'doc.signed', 'system', { contractId: contractRef, docId }, 'client')
  return { ok: true, executed }
}
