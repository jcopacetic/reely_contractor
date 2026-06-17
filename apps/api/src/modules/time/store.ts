/**
 * time store — work tracked against a contract (`time_entry`). The contractor (the contract's contractor)
 * is the only writer: the timer (start/stop), the browser extension, and manual entries all land here. The
 * contract's client reads + APPROVES; only `approved = true` entries are billable (the payments cycle sums
 * those exclusively). Participant-scoped (contractor writes own, client reads/approves). Raw prisma + app-layer
 * scoping (the api connects as the owner role; RLS is defense-in-depth). Writes ONLY time_entry.
 */
import { randomUUID } from 'node:crypto'
import { prisma } from '@contractor/db'
import { emit } from '../../events'
import { presignPut, presignGet } from '../../clients/r2'
import { disabledReasonFor } from '../governance/store'

/** Auto-stop guard: a running timer can't bill more than this (a forgotten timer is clamped on stop/read). */
export const MAX_RUNNING_HOURS = 12
/** Manual / stopped entries shorter than this are rejected (fat-finger guard). */
export const MIN_ENTRY_SECONDS = 60
const MAX_RUNNING_SECONDS = MAX_RUNNING_HOURS * 3600

type TimeSource = 'timer' | 'extension' | 'manual'

export type TimeEntryView = {
  id: string
  contractId: string
  contractorUserId: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number
  description: string | null
  source: TimeSource
  /** verified = tracked by the timer/extension (activity-backed); manual entries are unverified. */
  verified: boolean
  approved: boolean
  approvedAt: string | null
  disputed: boolean
  disputeReason: string | null
  disputedAt: string | null
  running: boolean
  activitySamples: number // plugin-timer evidence captured for this entry
  avgActivityPct: number | null // average activity level across the samples
}
export type TimeSummary = {
  entries: TimeEntryView[]
  approvedSeconds: number // billable
  pendingSeconds: number // logged, awaiting approval (not disputed)
  disputedSeconds: number // contested by the client; won't bill until resolved
  runningEntryId: string | null
}

type Row = { id: string; contractId: string; contractorUserId: string; startedAt: Date; endedAt: Date | null; durationSeconds: number; description: string | null; source: string; approved: boolean; approvedAt: Date | null; disputed: boolean; disputeReason: string | null; disputedAt: Date | null }
export const toView = (e: Row): TimeEntryView => ({
  id: e.id,
  contractId: e.contractId,
  contractorUserId: e.contractorUserId,
  startedAt: e.startedAt.toISOString(),
  endedAt: e.endedAt ? e.endedAt.toISOString() : null,
  durationSeconds: e.durationSeconds,
  description: e.description,
  source: e.source as TimeSource,
  verified: e.source !== 'manual', // timer/extension are activity-backed; manual is self-reported
  approved: e.approved,
  approvedAt: e.approvedAt ? e.approvedAt.toISOString() : null,
  disputed: e.disputed,
  disputeReason: e.disputeReason,
  disputedAt: e.disputedAt ? e.disputedAt.toISOString() : null,
  running: e.endedAt === null,
  activitySamples: 0,
  avgActivityPct: null,
})

// ── scope helpers ─────────────────────────────────────────────────────────────────
type Parties = { clientUserId: string; contractorUserId: string; status: string }
async function contractParties(contractId: string): Promise<Parties | null> {
  return prisma.contract.findUnique({ where: { id: contractId }, select: { clientUserId: true, contractorUserId: true, status: true } })
}

// ── timer / entries (contractor-only writes) ───────────────────────────────────────
/** Start the running timer on a contract. Contractor-only, one running entry per contractor at a time. */
export async function start(contractorUserId: string, contractId: string, input?: { description?: string | null; source?: 'timer' | 'extension' }): Promise<{ entryId: string } | { error: string }> {
  const c = await contractParties(contractId)
  if (!c) return { error: 'contract_not_found' }
  if (c.contractorUserId !== contractorUserId) return { error: 'forbidden' }
  if (c.status !== 'active') return { error: 'contract_not_active' }
  const blocked = await disabledReasonFor(c)
  if (blocked) return { error: blocked } // client suspended / contractor suspended / contract paused — no clocking
  const running = await prisma.timeEntry.findFirst({ where: { contractorUserId, endedAt: null }, select: { id: true } })
  if (running) return { error: 'timer_already_running' }
  const e = await prisma.timeEntry.create({
    data: { contractId, contractorUserId, startedAt: new Date(), source: (input?.source ?? 'timer') as never, description: input?.description?.trim() || null },
    select: { id: true },
  })
  await emit('time', 'time_entry.created', contractorUserId, { contractId, entryId: e.id, source: input?.source ?? 'timer' }, 'contractor')
  return { entryId: e.id }
}

/** Stop the running timer. Sets ended_at + duration (clamped to the auto-stop guard). Contractor-only. */
export async function stop(contractorUserId: string, entryId: string): Promise<{ entryId: string; durationSeconds: number } | { error: string }> {
  const e = await prisma.timeEntry.findUnique({ where: { id: entryId }, select: { contractorUserId: true, startedAt: true, endedAt: true } })
  if (!e) return { error: 'not_found' }
  if (e.contractorUserId !== contractorUserId) return { error: 'forbidden' }
  if (e.endedAt) return { error: 'not_running' }
  const endedAt = new Date()
  const elapsed = Math.max(0, Math.floor((endedAt.getTime() - e.startedAt.getTime()) / 1000))
  const durationSeconds = Math.min(elapsed, MAX_RUNNING_SECONDS)
  await prisma.timeEntry.update({ where: { id: entryId }, data: { endedAt, durationSeconds } })
  return { entryId, durationSeconds }
}

/** Cancel/discard the running timer without recording time (mistaken start). Contractor-only. */
export async function cancelRunning(contractorUserId: string, entryId: string): Promise<{ ok: true } | { error: string }> {
  const e = await prisma.timeEntry.findUnique({ where: { id: entryId }, select: { contractorUserId: true, endedAt: true } })
  if (!e) return { error: 'not_found' }
  if (e.contractorUserId !== contractorUserId) return { error: 'forbidden' }
  if (e.endedAt) return { error: 'not_running' }
  await prisma.timeEntry.delete({ where: { id: entryId } })
  return { ok: true }
}

/** Add a completed entry by hand (or from the extension). Contractor-only; both ends required. */
export async function manualEntry(
  contractorUserId: string,
  contractId: string,
  input: { startedAt: string; endedAt: string; description?: string | null; source?: 'manual' | 'extension' },
): Promise<{ entryId: string } | { error: string }> {
  const c = await contractParties(contractId)
  if (!c) return { error: 'contract_not_found' }
  if (c.contractorUserId !== contractorUserId) return { error: 'forbidden' }
  if (c.status !== 'active') return { error: 'contract_not_active' }
  const blocked = await disabledReasonFor(c)
  if (blocked) return { error: blocked }
  const startedAt = new Date(input.startedAt)
  const endedAt = new Date(input.endedAt)
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) return { error: 'bad_dates' }
  if (endedAt <= startedAt) return { error: 'end_before_start' }
  const durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)
  if (durationSeconds < MIN_ENTRY_SECONDS) return { error: 'too_short' }
  if (durationSeconds > MAX_RUNNING_SECONDS) return { error: 'too_long' }
  const e = await prisma.timeEntry.create({
    data: { contractId, contractorUserId, startedAt, endedAt, durationSeconds, source: (input.source ?? 'manual') as never, description: input.description?.trim() || null },
    select: { id: true },
  })
  await emit('time', 'time_entry.created', contractorUserId, { contractId, entryId: e.id, source: input.source ?? 'manual' }, 'contractor')
  return { entryId: e.id }
}

// ── reads (participant-scoped) ──────────────────────────────────────────────────────
async function summarize(rows: Row[]): Promise<TimeSummary> {
  const entries = rows.map(toView)
  // enrich each entry with its plugin-timer activity (one groupBy over time_activity)
  if (entries.length > 0) {
    const grp = await prisma.timeActivity.groupBy({ by: ['timeEntryId'], where: { timeEntryId: { in: entries.map((e) => e.id) } }, _count: { _all: true }, _avg: { activityPct: true } })
    const byId = new Map(grp.map((g) => [g.timeEntryId, g]))
    for (const e of entries) {
      const g = byId.get(e.id)
      if (g) {
        e.activitySamples = g._count._all
        e.avgActivityPct = g._avg.activityPct != null ? Math.round(g._avg.activityPct) : null
      }
    }
  }
  return bucketSummary(entries)
}

/**
 * Pure aggregation: fold the (already view-mapped) entries into the billing buckets + running id. Running
 * entries are excluded from every total; otherwise the approved→disputed→pending precedence is exclusive.
 * Extracted from `summarize` so the bucketing logic is unit-testable without the DB enrichment groupBy.
 */
export function bucketSummary(entries: TimeEntryView[]): TimeSummary {
  let approvedSeconds = 0
  let pendingSeconds = 0
  let disputedSeconds = 0
  let runningEntryId: string | null = null
  for (const e of entries) {
    if (e.running) runningEntryId = e.id
    else if (e.approved) approvedSeconds += e.durationSeconds
    else if (e.disputed) disputedSeconds += e.durationSeconds
    else pendingSeconds += e.durationSeconds
  }
  return { entries, approvedSeconds, pendingSeconds, disputedSeconds, runningEntryId }
}

/** A contract's entries + summary — participant only (client or contractor). null otherwise (→ 404). */
export async function listTime(viewerUserId: string, contractId: string): Promise<TimeSummary | null> {
  const c = await contractParties(contractId)
  if (!c) return null
  if (c.clientUserId !== viewerUserId && c.contractorUserId !== viewerUserId) return null
  const rows = await prisma.timeEntry.findMany({ where: { contractId }, orderBy: { startedAt: 'desc' }, take: 500 })
  return summarize(rows)
}

/** The contractor's currently-running entry across all their contracts (drives the timer UI), or null. */
export async function getRunning(contractorUserId: string): Promise<TimeEntryView | null> {
  const e = await prisma.timeEntry.findFirst({ where: { contractorUserId, endedAt: null }, orderBy: { startedAt: 'desc' } })
  return e ? toView(e) : null
}

// ── approval (client-only; only approved bills) ─────────────────────────────────────
/** Approve an entry — only the contract's client. Makes it billable. Idempotent. */
export async function approve(clientUserId: string, entryId: string): Promise<{ ok: true } | { error: string }> {
  const e = await prisma.timeEntry.findUnique({ where: { id: entryId }, select: { id: true, contractId: true, endedAt: true, approved: true, contract: { select: { clientUserId: true } } } })
  if (!e) return { error: 'not_found' }
  if (e.contract.clientUserId !== clientUserId) return { error: 'forbidden' }
  if (e.endedAt === null) return { error: 'still_running' } // can't approve an open timer
  if (e.approved) return { ok: true }
  // Approving resolves any open dispute in the contractor's favour.
  await prisma.timeEntry.update({ where: { id: entryId }, data: { approved: true, approvedAt: new Date(), disputed: false, disputeReason: null, disputedAt: null } })
  await emit('time', 'time_entry.approved', clientUserId, { contractId: e.contractId, entryId }, 'client')
  return { ok: true }
}

/**
 * Dispute an entry — only the contract's CLIENT. Contests the entry (won't bill until resolved); does not
 * delete it. Refuses a running entry or one already swept into a billing cycle. Resolution = the client
 * approves (clears it) or withdraws, or the contractor concedes by deleting it.
 */
export async function dispute(clientUserId: string, entryId: string, reason: string): Promise<{ ok: true } | { error: string }> {
  const e = await prisma.timeEntry.findUnique({ where: { id: entryId }, select: { id: true, contractId: true, endedAt: true, billingCycleId: true, contract: { select: { clientUserId: true } } } })
  if (!e) return { error: 'not_found' }
  if (e.contract.clientUserId !== clientUserId) return { error: 'forbidden' }
  if (e.endedAt === null) return { error: 'still_running' }
  if (e.billingCycleId) return { error: 'already_billed' }
  await prisma.timeEntry.update({ where: { id: entryId }, data: { disputed: true, disputeReason: reason.trim().slice(0, 2000) || null, disputedAt: new Date(), approved: false, approvedAt: null } })
  await emit('time', 'time_entry.disputed', clientUserId, { contractId: e.contractId, entryId }, 'client')
  return { ok: true }
}

/** Withdraw a dispute (client changed their mind) — back to pending, not approved. Client-only. */
export async function withdrawDispute(clientUserId: string, entryId: string): Promise<{ ok: true } | { error: string }> {
  const e = await prisma.timeEntry.findUnique({ where: { id: entryId }, select: { contract: { select: { clientUserId: true } } } })
  if (!e) return { error: 'not_found' }
  if (e.contract.clientUserId !== clientUserId) return { error: 'forbidden' }
  await prisma.timeEntry.update({ where: { id: entryId }, data: { disputed: false, disputeReason: null, disputedAt: null } })
  return { ok: true }
}

/**
 * Delete a tracked entry — the contractor (owner) only, and only while un-billed. Serves both "remove time I
 * logged" and conceding a dispute (the contractor agrees and drops the entry). A billed entry is immutable.
 */
export async function deleteEntry(contractorUserId: string, entryId: string): Promise<{ ok: true } | { error: string }> {
  const e = await prisma.timeEntry.findUnique({ where: { id: entryId }, select: { contractorUserId: true, billingCycleId: true } })
  if (!e) return { error: 'not_found' }
  if (e.contractorUserId !== contractorUserId) return { error: 'forbidden' }
  if (e.billingCycleId) return { error: 'already_billed' }
  await prisma.timeEntry.delete({ where: { id: entryId } })
  return { ok: true }
}

/** Revoke approval (before a cycle sweeps it). Client-only; refuses once billed into a cycle. */
export async function unapprove(clientUserId: string, entryId: string): Promise<{ ok: true } | { error: string }> {
  const e = await prisma.timeEntry.findUnique({ where: { id: entryId }, select: { id: true, billingCycleId: true, contract: { select: { clientUserId: true } } } })
  if (!e) return { error: 'not_found' }
  if (e.contract.clientUserId !== clientUserId) return { error: 'forbidden' }
  if (e.billingCycleId) return { error: 'already_billed' }
  await prisma.timeEntry.update({ where: { id: entryId }, data: { approved: false, approvedAt: null } })
  return { ok: true }
}

// ── provider surface (Board, service-key; resource-scoped to Board-originated contracts) ──────────
/** A Board-originated contract's time + summary, for Board. Scoped: only contracts carrying a boardRef. */
export async function providerListTime(contractRef: string): Promise<TimeSummary | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractRef }, select: { boardRef: true } })
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  const rows = await prisma.timeEntry.findMany({ where: { contractId: contractRef }, orderBy: { startedAt: 'desc' }, take: 500 })
  return summarize(rows)
}

/** Board (the client) approves an entry. Scoped to the named Board-originated contract. */
export async function providerApprove(contractRef: string, entryId: string): Promise<{ ok: true } | { error: string }> {
  const e = await prisma.timeEntry.findUnique({ where: { id: entryId }, select: { contractId: true, endedAt: true, approved: true, contract: { select: { boardRef: true, clientUserId: true } } } })
  if (!e || e.contractId !== contractRef) return { error: 'not_found' }
  if (!e.contract.boardRef) return { error: 'forbidden' }
  if (e.endedAt === null) return { error: 'still_running' }
  if (e.approved) return { ok: true }
  await prisma.timeEntry.update({ where: { id: entryId }, data: { approved: true, approvedAt: new Date(), disputed: false, disputeReason: null, disputedAt: null } })
  await emit('time', 'time_entry.approved', e.contract.clientUserId, { contractId: contractRef, entryId, via: 'board' }, 'client')
  return { ok: true }
}

/** Board (the client) disputes an entry. Scoped to the named Board-originated contract. */
export async function providerDispute(contractRef: string, entryId: string, reason: string): Promise<{ ok: true } | { error: string }> {
  const e = await prisma.timeEntry.findUnique({ where: { id: entryId }, select: { contractId: true, endedAt: true, billingCycleId: true, contract: { select: { boardRef: true, clientUserId: true } } } })
  if (!e || e.contractId !== contractRef) return { error: 'not_found' }
  if (!e.contract.boardRef) return { error: 'forbidden' }
  if (e.endedAt === null) return { error: 'still_running' }
  if (e.billingCycleId) return { error: 'already_billed' }
  await prisma.timeEntry.update({ where: { id: entryId }, data: { disputed: true, disputeReason: reason.trim().slice(0, 2000) || null, disputedAt: new Date(), approved: false, approvedAt: null } })
  await emit('time', 'time_entry.disputed', e.contract.clientUserId, { contractId: contractRef, entryId, via: 'board' }, 'client')
  return { ok: true }
}

// ── plugin-timer evidence: activity samples + screenshots (extension ingestion + reads) ───────────────
type Sample = { capturedAt: string; activityPct?: number | null; title?: string | null; screenshotKey?: string | null }
export type ActivityView = { id: string; capturedAt: string; activityPct: number | null; title: string | null; screenshotUrl: string | null }

async function ownEntryContract(contractorUserId: string, entryId: string): Promise<string | null> {
  const e = await prisma.timeEntry.findUnique({ where: { id: entryId }, select: { contractId: true, contractorUserId: true } })
  return e && e.contractorUserId === contractorUserId ? e.contractId : null
}

async function loadEvidence(entryId: string): Promise<ActivityView[]> {
  const rows = await prisma.timeActivity.findMany({ where: { timeEntryId: entryId }, orderBy: { capturedAt: 'asc' }, take: 500, select: { id: true, capturedAt: true, activityPct: true, title: true, screenshotKey: true } })
  return Promise.all(rows.map(async (r) => ({ id: r.id, capturedAt: r.capturedAt.toISOString(), activityPct: r.activityPct, title: r.title, screenshotUrl: await presignGet(r.screenshotKey) })))
}

/** A presigned PUT URL for the extension to upload one screenshot straight to R2, + the key to reference later. */
export async function presignScreenshot(contractorUserId: string, entryId: string): Promise<{ key: string; uploadUrl: string } | { error: string }> {
  const contractId = await ownEntryContract(contractorUserId, entryId)
  if (!contractId) return { error: 'not_found' }
  const key = `time/${contractId}/${entryId}/${randomUUID()}.jpg`
  const uploadUrl = await presignPut(key, 'image/jpeg')
  if (!uploadUrl) return { error: 'storage_unconfigured' }
  return { key, uploadUrl }
}

/** Record activity samples (each with an optional uploaded-screenshot key) for an entry. Contractor-owned. */
export async function submitActivity(contractorUserId: string, entryId: string, samples: Sample[]): Promise<{ count: number } | { error: string }> {
  if (!(await ownEntryContract(contractorUserId, entryId))) return { error: 'not_found' }
  if (samples.length === 0) return { count: 0 }
  const data = samples.slice(0, 200).map((s) => ({
    timeEntryId: entryId,
    contractorUserId,
    capturedAt: new Date(s.capturedAt),
    activityPct: typeof s.activityPct === 'number' ? Math.max(0, Math.min(100, Math.round(s.activityPct))) : null,
    title: s.title?.trim().slice(0, 200) || null,
    screenshotKey: s.screenshotKey || null,
  }))
  await prisma.timeActivity.createMany({ data })
  return { count: data.length }
}

/** An entry's activity evidence (samples + signed screenshot URLs), participant-gated (client sees always). */
export async function entryEvidence(viewerUserId: string, entryId: string): Promise<{ samples: ActivityView[] } | null> {
  const e = await prisma.timeEntry.findUnique({ where: { id: entryId }, select: { contractorUserId: true, contract: { select: { clientUserId: true } } } })
  if (!e) return null
  if (e.contractorUserId !== viewerUserId && e.contract.clientUserId !== viewerUserId) return null
  return { samples: await loadEvidence(entryId) }
}

/** Provider (Board client) evidence read — scoped to the named Board-originated contract. */
export async function providerEntryEvidence(contractRef: string, entryId: string): Promise<{ samples: ActivityView[] } | { error: string }> {
  const e = await prisma.timeEntry.findUnique({ where: { id: entryId }, select: { contractId: true, contract: { select: { boardRef: true } } } })
  if (!e || e.contractId !== contractRef) return { error: 'not_found' }
  if (!e.contract.boardRef) return { error: 'forbidden' }
  return { samples: await loadEvidence(entryId) }
}
