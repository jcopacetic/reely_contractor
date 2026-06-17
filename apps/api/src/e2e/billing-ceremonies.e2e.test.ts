import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@contractor/db'
import { appRouter } from '../trpc/router'
import type { ApiContext, ActorRole } from '../trpc/trpc'
import { sweepCycle, chargeDueCycles, raiseCycleDispute } from '../modules/payments/store'
import { start as startTimer } from '../modules/time/store'

/**
 * DB-backed e2e for the systems shipped this cycle — the agile ceremonies, the governance kill-switch, the
 * immutable ledger, disputes, and the billing dashboard — driven through the real tRPC procedures + stores
 * against real Postgres. Hermetic: every row is RUN-namespaced and torn down in afterAll.
 *
 * Two vetted contractors stand in for the two sides of a contract; the role is derived from the contract
 * (clientUserId vs contractorUserId), exactly as in prod.
 */
const RUN = `e2e-bc-${Date.now()}`
const uid = (s: string) => `${RUN}:${s}`

const ctx = (clerkUserId: string | undefined, role: ActorRole, serviceCaller = true): ApiContext => ({ clerkUserId, role, serviceCaller })
const call = (c: ApiContext) => appRouter.createCaller(c)

// Participant procedures return `View | { error }`; the happy-path tests assert success — narrow it.
function rows<T>(r: T[] | { error: string }): T[] {
  if (!Array.isArray(r)) throw new Error((r as { error: string }).error)
  return r
}
function val<T>(r: T | { error: string }): T {
  if (r && typeof r === 'object' && 'error' in r) throw new Error((r as { error: string }).error)
  return r as T
}

const CLIENT = uid('client') // vetted; plays the CLIENT on the contracts
const WORKER = uid('worker') // vetted; plays the CONTRACTOR
const THIRD = uid('third') // vetted; a non-participant
const DREW = uid('drew') // vetted; the throwaway for the contractor-suspend test
const ADMIN = uid('admin') // platform_admin

const mkIdentity = (clerkUserId: string) => prisma.contractorIdentity.create({ data: { clerkUserId, status: 'vetted', vettedAt: new Date() } })
const mkContract = (over: Record<string, unknown> = {}) =>
  prisma.contract.create({ data: { clientUserId: CLIENT, contractorUserId: WORKER, title: 'Work', rateType: 'hourly', rateAmount: 100, ...over } })

beforeAll(async () => {
  await Promise.all([mkIdentity(CLIENT), mkIdentity(WORKER), mkIdentity(THIRD), mkIdentity(DREW), mkIdentity(ADMIN)])
})

afterAll(async () => {
  const users = [CLIENT, WORKER, THIRD, DREW, ADMIN]
  await prisma.ledgerEntry.deleteMany({ where: { OR: [{ clientUserId: { in: users } }, { contractorUserId: { in: users } }] } })
  await prisma.notification.deleteMany({ where: { userId: { in: users } } })
  await prisma.clientStanding.deleteMany({ where: { clientUserId: { in: users } } })
  await prisma.stripeAccount.deleteMany({ where: { contractorUserId: { in: users } } })
  await prisma.contract.deleteMany({ where: { OR: [{ clientUserId: { in: users } }, { contractorUserId: { in: users } }] } }) // cascades items/time/cycles/charges/payouts/disputes + ceremonies
  await prisma.appEvent.deleteMany({ where: { actorId: { in: users } } })
  await prisma.contractorIdentity.deleteMany({ where: { clerkUserId: { in: users } } })
})

describe('sprint — two-party negotiation → review → accept', () => {
  let contractId: string
  beforeAll(async () => { contractId = (await mkContract()).id })
  const items = [{ title: 'Build the page', effortPoints: 4 }, { title: 'Wire the API', effortPoints: 2 }]

  it('the contractor proposes; their side approves, the client has not', async () => {
    const r = (await call(ctx(WORKER, 'contractor')).sprint.propose({ contractId, items, ttdDays: 7 })) as { id: string }
    expect(r.id).toBeTruthy()
    const list = rows(await call(ctx(WORKER, 'contractor')).sprint.list({ contractId }))
    const s = list[0]!
    expect(s.status).toBe('proposed')
    expect(s.contractorApproved).toBe(true)
    expect(s.clientApproved).toBe(false)
    expect(s.expectedHours).toBe(6) // Σ effort points
    expect(s.expectedBudget).toBe(600) // 6h × $100
  })

  it('a non-participant cannot propose', async () => {
    expect(await call(ctx(THIRD, 'contractor')).sprint.propose({ contractId, items, ttdDays: 7 })).toEqual({ error: 'forbidden' })
  })

  it('the client approves → agreed; the contractor submits → review; the client accepts → completed', async () => {
    const id = rows(await call(ctx(WORKER, 'contractor')).sprint.list({ contractId }))[0]!.id
    expect(await call(ctx(CLIENT, 'contractor')).sprint.approve({ sprintId: id })).toMatchObject({ ok: true, agreed: true })
    expect(rows(await call(ctx(WORKER, 'contractor')).sprint.list({ contractId }))[0]!.status).toBe('agreed')

    expect(await call(ctx(WORKER, 'contractor')).sprint.submit({ sprintId: id, note: 'done — see staging' })).toEqual({ ok: true })
    expect(rows(await call(ctx(CLIENT, 'contractor')).sprint.list({ contractId }))[0]!.status).toBe('review')

    // only the contractor submits; the client accepts
    expect(await call(ctx(WORKER, 'contractor')).sprint.accept({ sprintId: id })).toEqual({ error: 'forbidden' })
    expect(await call(ctx(CLIENT, 'contractor')).sprint.accept({ sprintId: id })).toEqual({ ok: true })
    expect(rows(await call(ctx(WORKER, 'contractor')).sprint.list({ contractId }))[0]!.status).toBe('completed')
  })

  it('request-changes sends a submitted sprint back to agreed', async () => {
    const id = (await call(ctx(WORKER, 'contractor')).sprint.propose({ contractId, items, ttdDays: 5 }) as { id: string }).id
    await call(ctx(CLIENT, 'contractor')).sprint.approve({ sprintId: id })
    await call(ctx(WORKER, 'contractor')).sprint.submit({ sprintId: id, note: 'v1' })
    expect(await call(ctx(CLIENT, 'contractor')).sprint.requestChanges({ sprintId: id, note: 'tighten the copy' })).toEqual({ ok: true })
    const s = rows(await call(ctx(WORKER, 'contractor')).sprint.list({ contractId })).find((x) => x.id === id)!
    expect(s.status).toBe('agreed')
    expect(s.changeRequestNote).toBe('tighten the copy')
  })
})

describe('blockers + change-requests + charter', () => {
  let contractId: string
  beforeAll(async () => { contractId = (await mkContract()).id })

  it('a blocker is raised and resolved by either party', async () => {
    const { id } = (await call(ctx(WORKER, 'contractor')).blocker.raise({ contractId, reason: 'waiting on design' })) as { id: string }
    expect(rows(await call(ctx(CLIENT, 'contractor')).blocker.list({ contractId })).find((b) => b.id === id)!.status).toBe('open')
    expect(await call(ctx(CLIENT, 'contractor')).blocker.resolve({ blockerId: id, note: 'design sent' })).toEqual({ ok: true })
    expect(rows(await call(ctx(WORKER, 'contractor')).blocker.list({ contractId })).find((b) => b.id === id)!.status).toBe('resolved')
  })

  it('a change-request is two-party agreed', async () => {
    const { id } = (await call(ctx(WORKER, 'contractor')).changeRequest.propose({ contractId, kind: 'scope', title: 'Add a report', detail: 'Weekly PDF' })) as { id: string }
    expect(await call(ctx(CLIENT, 'contractor')).changeRequest.approve({ changeRequestId: id })).toMatchObject({ ok: true, agreed: true })
    expect(rows(await call(ctx(WORKER, 'contractor')).changeRequest.list({ contractId })).find((c) => c.id === id)!.status).toBe('agreed')
  })

  it('a rate change-request keeps the proposed rate; non-rate kinds drop it', async () => {
    const { id } = (await call(ctx(CLIENT, 'contractor')).changeRequest.propose({ contractId, kind: 'rate', title: 'Bump rate', detail: 'scope grew', proposedRateType: 'hourly', proposedRateAmount: 125 })) as { id: string }
    const cr = rows(await call(ctx(WORKER, 'contractor')).changeRequest.list({ contractId })).find((c) => c.id === id)!
    expect(cr.proposedRateAmount).toBe(125)
    expect(cr.appliedAt).toBeNull() // recorded, not enacted
  })

  it('the charter requires both acknowledgments to kick off', async () => {
    expect(await call(ctx(WORKER, 'contractor')).charter.save({ contractId, goals: 'Ship v1', workingAgreement: 'Async', successCriteria: 'Launched' })).toEqual({ ok: true })
    // the saver (contractor) is acknowledged; one side is not enough
    expect(await call(ctx(WORKER, 'contractor')).charter.acknowledge({ contractId })).toMatchObject({ kickedOff: false })
    expect(val(await call(ctx(CLIENT, 'contractor')).charter.get({ contractId })).status).toBe('draft')
    // the client acknowledges → kicked off
    expect(await call(ctx(CLIENT, 'contractor')).charter.acknowledge({ contractId })).toMatchObject({ ok: true, kickedOff: true })
    expect(val(await call(ctx(WORKER, 'contractor')).charter.get({ contractId })).status).toBe('active')
  })
})

describe('governance kill-switch — client suspend blocks the timer', () => {
  let contractId: string
  beforeAll(async () => { contractId = (await mkContract()).id })

  it('the contractor can clock time while the client is in good standing', async () => {
    const r = await startTimer(WORKER, contractId)
    expect(r).toHaveProperty('entryId')
    await prisma.timeEntry.updateMany({ where: { contractId, endedAt: null }, data: { endedAt: new Date(), durationSeconds: 60 } }) // close it
  })

  it('suspending the client stops the clock (admin-gated) and reinstating restores it', async () => {
    await expect(call(ctx(WORKER, 'contractor')).governance.suspendClient({ clientUserId: CLIENT, reason: 'payment_declined' })).rejects.toThrow(/platform_admin required/)
    expect(await call(ctx(ADMIN, 'platform_admin')).governance.suspendClient({ clientUserId: CLIENT, reason: 'payment_declined' })).toEqual({ ok: true })
    expect((await prisma.clientStanding.findUnique({ where: { clientUserId: CLIENT } }))!.status).toBe('suspended')

    expect(await startTimer(WORKER, contractId)).toEqual({ error: 'client_suspended' })

    expect(await call(ctx(ADMIN, 'platform_admin')).governance.reinstateClient({ clientUserId: CLIENT })).toEqual({ ok: true })
    expect(await startTimer(WORKER, contractId)).toHaveProperty('entryId')
    await prisma.timeEntry.updateMany({ where: { contractId, endedAt: null }, data: { endedAt: new Date(), durationSeconds: 60 } })
  })

  it('suspending a contractor revokes their vetting; reinstating restores it', async () => {
    await prisma.contract.create({ data: { clientUserId: CLIENT, contractorUserId: DREW, title: 'Drew work', rateType: 'hourly', rateAmount: 100 } })
    expect(await call(ctx(ADMIN, 'platform_admin')).governance.suspendContractor({ contractorUserId: DREW, reason: 'conduct' })).toEqual({ ok: true })
    expect((await prisma.contractorIdentity.findUnique({ where: { clerkUserId: DREW } }))!.status).toBe('suspended')
    await expect(call(ctx(DREW, 'contractor')).sprint.list({ contractId })).rejects.toThrow(/vetting required/)
    expect(await call(ctx(ADMIN, 'platform_admin')).governance.reinstateContractor({ contractorUserId: DREW })).toEqual({ ok: true })
    expect((await prisma.contractorIdentity.findUnique({ where: { clerkUserId: DREW } }))!.status).toBe('vetted')
  })
})

/** A period whose dispute window is already in the past → eligible to charge as soon as it's swept. */
const P_START = new Date('2026-05-03T18:00:00.000Z')
const P_END = new Date('2026-05-10T18:00:00.000Z')

describe('ledger — an immutable row per money event', () => {
  let contractId: string
  let cycleId: string
  beforeAll(async () => {
    contractId = (await mkContract({ title: 'Ledger work' })).id
    await prisma.timeEntry.create({ data: { contractId, contractorUserId: WORKER, startedAt: P_START, endedAt: new Date(P_START.getTime() + 3600_000), durationSeconds: 3600, source: 'timer', approved: true, approvedAt: new Date() } })
    cycleId = (await sweepCycle(contractId, P_START, P_END))!.cycleId
  })

  it('charging a cycle (stub) appends a charge ledger row, fully attributed', async () => {
    await chargeDueCycles(new Date())
    const entries = await prisma.ledgerEntry.findMany({ where: { billingCycleId: cycleId } })
    expect(entries).toHaveLength(1)
    const e = entries[0]!
    expect(e.kind).toBe('charge')
    expect(Number(e.grossAmount)).toBe(100)
    expect(e.clientUserId).toBe(CLIENT)
    expect(e.contractorUserId).toBe(WORKER)
    expect(e.stripePaymentIntentId).toMatch(/^pi_stub_/)
    expect(e.idempotencyKey).toContain('ledger:charge:')
  })

  it('the contractor reads their own ledger', async () => {
    const rows = await call(ctx(WORKER, 'contractor')).payments.ledger()
    expect(rows.some((r) => r.contractId === contractId && r.kind === 'charge')).toBe(true)
  })
})

describe('disputes — admin queue + waive records an adjustment', () => {
  let contractId: string
  let cycleId: string
  beforeAll(async () => {
    contractId = (await mkContract({ title: 'Disputed work', rateAmount: 200 })).id
    await prisma.timeEntry.create({ data: { contractId, contractorUserId: WORKER, startedAt: P_START, endedAt: new Date(P_START.getTime() + 3600_000), durationSeconds: 3600, source: 'timer', approved: true, approvedAt: new Date() } })
    cycleId = (await sweepCycle(contractId, P_START, P_END))!.cycleId
    await raiseCycleDispute(CLIENT, cycleId, 'these hours look high')
  })

  it('an open dispute shows in the admin queue with the full context', async () => {
    const queue = await call(ctx(ADMIN, 'platform_admin')).payments.disputeQueue()
    const d = queue.find((x) => x.billingCycleId === cycleId)!
    expect(d).toBeTruthy()
    expect(d.contractTitle).toBe('Disputed work')
    expect(d.amount).toBe(200)
    expect(d.raisedByRole).toBe('client')
    expect(d.clientUserId).toBe(CLIENT)
    expect(d.contractorUserId).toBe(WORKER)
  })

  it('waiving voids the cycle and records an immutable adjustment ledger row', async () => {
    const d = (await call(ctx(ADMIN, 'platform_admin')).payments.disputeQueue()).find((x) => x.billingCycleId === cycleId)!
    expect(await call(ctx(ADMIN, 'platform_admin')).payments.resolveDispute({ disputeId: d.disputeId, resolution: 'void' })).toEqual({ ok: true })
    expect((await prisma.billingCycle.findUniqueOrThrow({ where: { id: cycleId } })).status).toBe('voided')
    const adj = await prisma.ledgerEntry.findFirst({ where: { billingCycleId: cycleId, kind: 'adjustment' } })
    expect(adj).toBeTruthy()
    expect(Number(adj!.grossAmount)).toBe(200)
    expect(Number(adj!.netAmount)).toBe(0)
  })
})

describe('billing dashboard — the current week is the in-progress accrual', () => {
  let contractId: string
  beforeAll(async () => {
    contractId = (await mkContract({ title: 'This-week work' })).id
    // an ended entry started "now" lands in the current week bucket (no cycle yet → in progress)
    await prisma.timeEntry.create({ data: { contractId, contractorUserId: WORKER, startedAt: new Date(), endedAt: new Date(), durationSeconds: 3600, source: 'timer', approved: true, approvedAt: new Date() } })
  })

  it('the contractor dashboard buckets the current week as in-progress', async () => {
    const weeks = await call(ctx(WORKER, 'contractor')).payments.dashboard()
    expect(weeks).toHaveLength(3)
    expect(weeks[0]!.label).toBe('This week')
    const row = weeks[0]!.rows.find((r) => r.contractId === contractId)!
    expect(row).toBeTruthy()
    expect(row.status).toBe('in_progress')
    expect(row.seconds).toBe(3600)
  })
})

describe('notifications — the in-app bell store', () => {
  it('lists the viewer’s own rows, counts unread, and marks all read', async () => {
    await prisma.notification.createMany({
      data: [
        { userId: WORKER, type: 'sprint.accepted', payload: { ceremony: 'sprint', title: 'Sprint accepted' } },
        { userId: WORKER, type: 'blocker.resolved', payload: { ceremony: 'blocker', title: 'Blocker resolved' } },
        { userId: THIRD, type: 'sprint.accepted', payload: { ceremony: 'sprint', title: 'not yours' } },
      ],
    })
    const before = await call(ctx(WORKER, 'contractor')).notifications.list()
    expect(before.unread).toBeGreaterThanOrEqual(2)
    expect(before.items.every((i) => i.title !== 'not yours')).toBe(true) // user-scoped
    expect(await call(ctx(WORKER, 'contractor')).notifications.markAllRead()).toEqual({ ok: true })
    expect((await call(ctx(WORKER, 'contractor')).notifications.unreadCount()).unread).toBe(0)
  })
})
