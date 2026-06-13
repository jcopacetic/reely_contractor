/**
 * reviews store — a client's reviews of the contractor on a contract. WEEKLY reviews (while the contract is
 * active) are private until the contractor APPROVES them for display; the FINAL review (at contract close) is
 * ALWAYS public. The public profile shows the displayed set (all final + approved weekly) + an aggregate rating.
 * Native client paths (the contract's client) and a Board provider seam (boardRef-scoped) both feed this.
 */
import { prisma } from '@contractor/db'
import { emit } from '../../events'

export type ReviewView = { id: string; kind: 'weekly' | 'final'; rating: number; body: string; authorLabel: string | null; weekOf: string | null; approvedForDisplay: boolean; createdAt: string }
export type PublicReviews = { avg: number; count: number; items: Array<{ id: string; kind: string; rating: number; body: string; authorLabel: string | null; createdAt: string }> }

const clampRating = (n: number): number | null => {
  const r = Math.round(n)
  return r >= 1 && r <= 5 ? r : null
}
const trim = (s: string) => s.trim().slice(0, 2000)

/** Monday 00:00 UTC of the current ISO week — a stable per-week key for weekly reviews. */
function weekStart(now = new Date()): Date {
  const x = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dow = (x.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  x.setUTCDate(x.getUTCDate() - dow)
  return x
}

async function contractFor(contractId: string) {
  return prisma.contract.findUnique({ where: { id: contractId }, select: { clientUserId: true, contractorUserId: true, boardRef: true, status: true } })
}

type ReviewRow = { id: string; kind: 'weekly' | 'final'; rating: number; body: string; authorLabel: string | null; weekOf: Date | null; approvedForDisplay: boolean; createdAt: Date }
const toView = (r: ReviewRow): ReviewView => ({ id: r.id, kind: r.kind, rating: r.rating, body: r.body, authorLabel: r.authorLabel, weekOf: r.weekOf ? r.weekOf.toISOString() : null, approvedForDisplay: r.approvedForDisplay, createdAt: r.createdAt.toISOString() })

// ── internal writers ──────────────────────────────────────────────────────────────
async function writeWeekly(contractorUserId: string, contractId: string, authorRef: string, authorLabel: string | null, rating: number, body: string): Promise<{ ok: true } | { error: string }> {
  const r = clampRating(rating)
  if (!r || !body.trim()) return { error: 'invalid' }
  const weekOf = weekStart()
  // One weekly per (contract, week): re-submitting the same week updates it (default: not yet approved for display).
  await prisma.contractorReview.upsert({
    where: { contractId_weekOf: { contractId, weekOf } },
    update: { rating: r, body: trim(body), authorRef, authorLabel },
    create: { contractId, contractorUserId, authorRef, authorLabel, kind: 'weekly', rating: r, body: trim(body), weekOf },
  })
  await emit('reviews', 'review.created', contractorUserId, { contractId, kind: 'weekly' }, 'system')
  return { ok: true }
}

async function writeFinal(contractorUserId: string, contractId: string, authorRef: string, authorLabel: string | null, rating: number, body: string): Promise<{ ok: true } | { error: string }> {
  const r = clampRating(rating)
  if (!r || !body.trim()) return { error: 'invalid' }
  const existing = await prisma.contractorReview.findFirst({ where: { contractId, kind: 'final' }, select: { id: true } })
  if (existing) await prisma.contractorReview.update({ where: { id: existing.id }, data: { rating: r, body: trim(body), authorRef, authorLabel } })
  else await prisma.contractorReview.create({ data: { contractId, contractorUserId, authorRef, authorLabel, kind: 'final', rating: r, body: trim(body) } })
  await emit('reviews', 'review.created', contractorUserId, { contractId, kind: 'final' }, 'system')
  return { ok: true }
}

// ── native client paths (the acting user must be the contract's client) ─────────────
export async function clientCreateWeekly(actingUserId: string, contractId: string, rating: number, body: string): Promise<{ ok: true } | { error: string }> {
  const c = await contractFor(contractId)
  if (!c) return { error: 'not_found' }
  if (c.clientUserId !== actingUserId) return { error: 'forbidden' } // only the client reviews
  if (c.status !== 'active') return { error: 'not_active' }
  return writeWeekly(c.contractorUserId, contractId, actingUserId, null, rating, body)
}
export async function clientCreateFinal(actingUserId: string, contractId: string, rating: number, body: string): Promise<{ ok: true } | { error: string }> {
  const c = await contractFor(contractId)
  if (!c) return { error: 'not_found' }
  if (c.clientUserId !== actingUserId) return { error: 'forbidden' }
  if (c.status !== 'completed') return { error: 'not_completed' }
  return writeFinal(c.contractorUserId, contractId, actingUserId, null, rating, body)
}

/** A contract's reviews for a participant (client or contractor). null if not a participant. */
export async function listForViewer(viewerUserId: string, contractId: string): Promise<ReviewView[] | null> {
  const c = await contractFor(contractId)
  if (!c || (c.clientUserId !== viewerUserId && c.contractorUserId !== viewerUserId)) return null
  const rows = await prisma.contractorReview.findMany({ where: { contractId }, orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }], select: reviewSelect })
  return rows.map(toView)
}

// ── contractor management ───────────────────────────────────────────────────────────
/** The contractor approves/hides a WEEKLY review for their public profile. Finals are always public (forbidden). */
export async function toggleApproval(contractorUserId: string, reviewId: string): Promise<{ ok: true; approvedForDisplay: boolean } | { error: string }> {
  const r = await prisma.contractorReview.findUnique({ where: { id: reviewId }, select: { kind: true, approvedForDisplay: true, contractorUserId: true } })
  if (!r) return { error: 'not_found' }
  if (r.contractorUserId !== contractorUserId) return { error: 'forbidden' }
  if (r.kind === 'final') return { error: 'final_always_public' }
  const u = await prisma.contractorReview.update({ where: { id: reviewId }, data: { approvedForDisplay: !r.approvedForDisplay }, select: { approvedForDisplay: true } })
  return { ok: true, approvedForDisplay: u.approvedForDisplay }
}

// ── public profile aggregate (all final + approved weekly) ────────────────────────────
const reviewSelect = { id: true, kind: true, rating: true, body: true, authorLabel: true, weekOf: true, approvedForDisplay: true, createdAt: true } as const

export async function publicReviews(contractorUserId: string): Promise<PublicReviews> {
  const rows = await prisma.contractorReview.findMany({
    where: { contractorUserId, OR: [{ kind: 'final' }, { kind: 'weekly', approvedForDisplay: true }] },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, kind: true, rating: true, body: true, authorLabel: true, createdAt: true },
  })
  const count = rows.length
  const avg = count ? Math.round((rows.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10 : 0
  return { avg, count, items: rows.map((r) => ({ id: r.id, kind: r.kind, rating: r.rating, body: r.body, authorLabel: r.authorLabel, createdAt: r.createdAt.toISOString() })) }
}

// ── Board provider seam (boardRef-scoped) ─────────────────────────────────────────────
export async function providerCreateWeekly(contractRef: string, rating: number, body: string, authorLabel?: string | null): Promise<{ ok: true } | { error: string }> {
  const c = await contractFor(contractRef)
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  if (c.status !== 'active') return { error: 'not_active' }
  return writeWeekly(c.contractorUserId, contractRef, c.boardRef, authorLabel ?? null, rating, body)
}
export async function providerCreateFinal(contractRef: string, rating: number, body: string, authorLabel?: string | null): Promise<{ ok: true } | { error: string }> {
  const c = await contractFor(contractRef)
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  if (c.status !== 'completed') return { error: 'not_completed' }
  return writeFinal(c.contractorUserId, contractRef, c.boardRef, authorLabel ?? null, rating, body)
}
export async function providerList(contractRef: string): Promise<ReviewView[] | { error: string }> {
  const c = await contractFor(contractRef)
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  const rows = await prisma.contractorReview.findMany({ where: { contractId: contractRef }, orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }], select: reviewSelect })
  return rows.map(toView)
}
