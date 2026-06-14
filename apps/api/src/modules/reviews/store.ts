/**
 * reviews store — a client's reviews of the contractor on a contract. WEEKLY reviews (while active) are a
 * 2-second PULSE (up/neutral/down) + optional "kudos" chips + an optional one-liner; they stay private until the
 * contractor APPROVES them for display. The FINAL review (at close) is a structured verdict — four star
 * DIMENSIONS (communication/quality/timeliness/collaboration) + kudos + a comment — and is ALWAYS public. The
 * public profile shows the displayed set + an aggregate (overall star, per-dimension averages, kudos badges).
 * Native client paths (the contract's client) and a Board provider seam (boardRef-scoped) both feed this.
 */
import { prisma, Prisma } from '@contractor/db'
import { emit } from '../../events'
import { DIMENSION_KEYS, isPulse, overallOf, parseDimensions, sanitizeKudos, type Dimensions, type Pulse } from './taxonomy'

export type WeeklyInput = { pulse?: unknown; kudos?: unknown; body?: unknown }
export type FinalInput = { dimensions?: unknown; kudos?: unknown; body?: unknown }

export type ReviewView = {
  id: string
  kind: 'weekly' | 'final'
  rating: number | null
  pulse: Pulse | null
  dimensions: Dimensions | null
  kudos: string[]
  body: string | null
  authorLabel: string | null
  weekOf: string | null
  approvedForDisplay: boolean
  createdAt: string
}
type PublicItem = { id: string; kind: string; rating: number | null; pulse: Pulse | null; dimensions: Dimensions | null; kudos: string[]; body: string | null; authorLabel: string | null; createdAt: string }
export type PublicReviews = {
  avg: number
  count: number
  dimensionAvgs: Dimensions | null
  kudos: Array<{ key: string; count: number }>
  items: PublicItem[]
}

const trimBody = (s: unknown, max = 2000): string | null => {
  const t = typeof s === 'string' ? s.trim() : ''
  return t ? t.slice(0, max) : null
}

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

const reviewSelect = { id: true, kind: true, rating: true, pulse: true, dimensions: true, kudos: true, body: true, authorLabel: true, weekOf: true, approvedForDisplay: true, createdAt: true } as const
type ReviewRow = {
  id: string; kind: 'weekly' | 'final'; rating: number | null; pulse: Pulse | null; dimensions: Prisma.JsonValue
  kudos: string[]; body: string | null; authorLabel: string | null; weekOf: Date | null; approvedForDisplay: boolean; createdAt: Date
}
const asDimensions = (v: Prisma.JsonValue): Dimensions | null => parseDimensions(v)
const toView = (r: ReviewRow): ReviewView => ({
  id: r.id, kind: r.kind, rating: r.rating, pulse: r.pulse, dimensions: asDimensions(r.dimensions), kudos: r.kudos ?? [],
  body: r.body, authorLabel: r.authorLabel, weekOf: r.weekOf ? r.weekOf.toISOString() : null, approvedForDisplay: r.approvedForDisplay, createdAt: r.createdAt.toISOString(),
})

// ── internal writers ──────────────────────────────────────────────────────────────
async function writeWeekly(contractorUserId: string, contractId: string, authorRef: string, authorLabel: string | null, input: WeeklyInput): Promise<{ ok: true } | { error: string }> {
  if (!isPulse(input.pulse)) return { error: 'invalid' }
  const kudos = sanitizeKudos(input.kudos)
  const body = trimBody(input.body, 280) // weekly one-liner is short + optional
  const weekOf = weekStart()
  // One weekly per (contract, week): re-submitting the same week updates it (default: not yet approved for display).
  await prisma.contractorReview.upsert({
    where: { contractId_weekOf: { contractId, weekOf } },
    update: { pulse: input.pulse, kudos, body, rating: null, dimensions: Prisma.DbNull, authorRef, authorLabel },
    create: { contractId, contractorUserId, authorRef, authorLabel, kind: 'weekly', pulse: input.pulse, kudos, body, weekOf },
  })
  await emit('reviews', 'review.created', contractorUserId, { contractId, kind: 'weekly', kudos }, 'system')
  return { ok: true }
}

async function writeFinal(contractorUserId: string, contractId: string, authorRef: string, authorLabel: string | null, input: FinalInput): Promise<{ ok: true } | { error: string }> {
  const dimensions = parseDimensions(input.dimensions)
  const body = trimBody(input.body)
  if (!dimensions || !body) return { error: 'invalid' }
  const kudos = sanitizeKudos(input.kudos)
  const rating = overallOf(dimensions)
  const data = { rating, dimensions: dimensions as unknown as Prisma.InputJsonValue, kudos, body, authorRef, authorLabel }
  const existing = await prisma.contractorReview.findFirst({ where: { contractId, kind: 'final' }, select: { id: true } })
  if (existing) await prisma.contractorReview.update({ where: { id: existing.id }, data })
  else await prisma.contractorReview.create({ data: { contractId, contractorUserId, kind: 'final', ...data } })
  await emit('reviews', 'review.created', contractorUserId, { contractId, kind: 'final', kudos }, 'system')
  return { ok: true }
}

// ── native client paths (the acting user must be the contract's client) ─────────────
export async function clientCreateWeekly(actingUserId: string, contractId: string, input: WeeklyInput): Promise<{ ok: true } | { error: string }> {
  const c = await contractFor(contractId)
  if (!c) return { error: 'not_found' }
  if (c.clientUserId !== actingUserId) return { error: 'forbidden' } // only the client reviews
  if (c.status !== 'active') return { error: 'not_active' }
  return writeWeekly(c.contractorUserId, contractId, actingUserId, null, input)
}
export async function clientCreateFinal(actingUserId: string, contractId: string, input: FinalInput): Promise<{ ok: true } | { error: string }> {
  const c = await contractFor(contractId)
  if (!c) return { error: 'not_found' }
  if (c.clientUserId !== actingUserId) return { error: 'forbidden' }
  if (c.status !== 'completed') return { error: 'not_completed' }
  return writeFinal(c.contractorUserId, contractId, actingUserId, null, input)
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
export async function publicReviews(contractorUserId: string): Promise<PublicReviews> {
  const rows = await prisma.contractorReview.findMany({
    where: { contractorUserId, OR: [{ kind: 'final' }, { kind: 'weekly', approvedForDisplay: true }] },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, kind: true, rating: true, pulse: true, dimensions: true, kudos: true, body: true, authorLabel: true, createdAt: true },
  })
  const items: PublicItem[] = rows.map((r) => ({
    id: r.id, kind: r.kind, rating: r.rating, pulse: r.pulse, dimensions: asDimensions(r.dimensions), kudos: r.kudos ?? [], body: r.body, authorLabel: r.authorLabel, createdAt: r.createdAt.toISOString(),
  }))

  // Overall star = mean of rated reviews (finals + legacy weeklies that carried a star).
  const rated = items.filter((r) => typeof r.rating === 'number') as Array<PublicItem & { rating: number }>
  const avg = rated.length ? Math.round((rated.reduce((a, r) => a + r.rating, 0) / rated.length) * 10) / 10 : 0

  // Per-dimension averages from the final reviews that carry dimensions.
  const dimed = items.filter((r) => r.dimensions)
  let dimensionAvgs: Dimensions | null = null
  if (dimed.length) {
    dimensionAvgs = {} as Dimensions
    for (const k of DIMENSION_KEYS) dimensionAvgs[k] = Math.round((dimed.reduce((a, r) => a + (r.dimensions as Dimensions)[k], 0) / dimed.length) * 10) / 10
  }

  // Collectible kudos badges = counts across the displayed set, most-endorsed first.
  const counts = new Map<string, number>()
  for (const r of items) for (const k of r.kudos) counts.set(k, (counts.get(k) ?? 0) + 1)
  const kudos = [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)

  return { avg, count: items.length, dimensionAvgs, kudos, items }
}

// ── Board provider seam (boardRef-scoped) ─────────────────────────────────────────────
export async function providerCreateWeekly(contractRef: string, input: WeeklyInput, authorLabel?: string | null): Promise<{ ok: true } | { error: string }> {
  const c = await contractFor(contractRef)
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  if (c.status !== 'active') return { error: 'not_active' }
  return writeWeekly(c.contractorUserId, contractRef, c.boardRef, authorLabel ?? null, input)
}
export async function providerCreateFinal(contractRef: string, input: FinalInput, authorLabel?: string | null): Promise<{ ok: true } | { error: string }> {
  const c = await contractFor(contractRef)
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  if (c.status !== 'completed') return { error: 'not_completed' }
  return writeFinal(c.contractorUserId, contractRef, c.boardRef, authorLabel ?? null, input)
}
export async function providerList(contractRef: string): Promise<ReviewView[] | { error: string }> {
  const c = await contractFor(contractRef)
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  const rows = await prisma.contractorReview.findMany({ where: { contractId: contractRef }, orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }], select: reviewSelect })
  return rows.map(toView)
}
