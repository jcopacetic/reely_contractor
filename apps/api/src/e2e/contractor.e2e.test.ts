import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@contractor/db'
import { appRouter } from '../trpc/router'
import type { ApiContext, ActorRole } from '../trpc/trpc'

/**
 * DB-backed security e2e — the contractor node's "definition of done" invariants against real Postgres,
 * driven through the real tRPC procedures (so the vetting/admin/service middleware is exercised, not just
 * the stores): vetting-gate · participant-scope · user-scope-isolation · public-field discipline.
 *
 * Hermetic: every row is namespaced by RUN and torn down in afterAll, so it is safe in a shared dev DB.
 */
const RUN = `e2e-${Date.now()}`
const uid = (s: string) => `${RUN}:${s}`

const ctx = (clerkUserId: string | undefined, role: ActorRole, serviceCaller = true): ApiContext => ({ clerkUserId, role, serviceCaller })
const call = (c: ApiContext) => appRouter.createCaller(c)
const SVC: ApiContext = { role: 'applicant', serviceCaller: true } // the Board provider (service key, no acting user)

// the players
const ALICE = uid('alice') // vetted contractor (public profile)
const BOB = uid('bob') // vetted contractor (non-public profile)
const CAROL = uid('carol') // vetted contractor — the third-party non-participant
const PAT = uid('pat') // applicant — NOT vetted
const ADMIN = uid('admin') // platform_admin
const TENANT = uid('acme-tenant') // an opaque Board org ref (for the provider chat tests)

async function makeIdentity(clerkUserId: string, status: 'applicant' | 'vetted') {
  await prisma.contractorIdentity.create({ data: { clerkUserId, status, vettedAt: status === 'vetted' ? new Date() : null } })
}
async function makeProfile(clerkUserId: string, firstName: string, lastName: string, extra: Record<string, unknown> = {}) {
  const id = await prisma.contractorIdentity.findUniqueOrThrow({ where: { clerkUserId }, select: { id: true } })
  await prisma.contractorProfile.create({
    data: { contractorIdentityId: id.id, clerkUserId, firstName, lastName, displayName: `${firstName} ${lastName}`, ...extra },
  })
}

beforeAll(async () => {
  await Promise.all([
    makeIdentity(ALICE, 'vetted'),
    makeIdentity(BOB, 'vetted'),
    makeIdentity(CAROL, 'vetted'),
    makeIdentity(PAT, 'applicant'),
    makeIdentity(ADMIN, 'vetted'),
  ])
  await makeProfile(ALICE, 'Alice', 'Anderson', { company: 'Acme', position: 'Engineer', isPublic: true, publicSlug: `${RUN}-alice` })
  await makeProfile(BOB, 'Bob', 'Baker', { isPublic: false, publicSlug: `${RUN}-bob` })
  await makeProfile(CAROL, 'Carol', 'Clark')
})

afterAll(async () => {
  const users = [ALICE, BOB, CAROL, PAT, ADMIN]
  await prisma.room.deleteMany({ where: { OR: [{ participants: { some: { contractorUserId: { in: users } } } }, { tenantRef: TENANT }] } }) // cascades to participants/messages/reads
  await prisma.contractItem.deleteMany({ where: { contract: { OR: [{ clientUserId: { in: users } }, { contractorUserId: { in: users } }] } } })
  await prisma.contract.deleteMany({ where: { OR: [{ clientUserId: { in: users } }, { contractorUserId: { in: users } }] } })
  await prisma.post.deleteMany({ where: { authorUserId: { in: users } } })
  await prisma.appEvent.deleteMany({ where: { actorId: { in: users } } })
  await prisma.contractorProfile.deleteMany({ where: { clerkUserId: { in: users } } })
  await prisma.contractorIdentity.deleteMany({ where: { clerkUserId: { in: users } } })
})

describe('vetting-gate', () => {
  it('blocks an unvetted applicant from a vetted procedure', async () => {
    await expect(call(ctx(PAT, 'applicant')).feed.createPost({ body: 'let me in' })).rejects.toThrow(/vetting required/)
  })
  it('allows a vetted contractor through', async () => {
    const r = await call(ctx(ALICE, 'contractor')).feed.createPost({ body: `hello ${RUN}` })
    expect(r).toBeTruthy()
  })
  it('rejects a caller missing the service key — the web-server trust boundary', async () => {
    await expect(call(ctx(ALICE, 'contractor', false)).feed.list()).rejects.toThrow(/service key required/)
  })
})

describe('admin-gate', () => {
  it('blocks a contractor from the platform-admin vetting queue', async () => {
    await expect(call(ctx(ALICE, 'contractor')).identity.vettingQueue()).rejects.toThrow(/platform_admin required/)
  })
  it('allows a platform_admin', async () => {
    const q = await call(ctx(ADMIN, 'platform_admin')).identity.vettingQueue()
    expect(Array.isArray(q)).toBe(true)
  })
})

describe('public-field discipline', () => {
  it('getPublic returns ONLY the safe subset — no raw first/last name or account internals', async () => {
    const pub = await call(ctx(undefined, 'applicant', false)).profile.getPublic({ slug: `${RUN}-alice` })
    expect(pub).toBeTruthy()
    expect(Object.keys(pub!).sort()).toEqual(
      ['avatarUrl', 'bio', 'categories', 'company', 'contractsCompleted', 'displayName', 'headline', 'hoursLogged', 'links', 'position'].sort(),
    )
    // the PII-ish raw identity + account internals must be absent
    for (const leaked of ['firstName', 'lastName', 'clerkUserId', 'isPublic', 'publicSlug', 'contractorIdentityId']) {
      expect(pub).not.toHaveProperty(leaked)
    }
    // the chosen public attributes ARE present
    expect(pub!.displayName).toBe('Alice Anderson')
    expect(pub!.company).toBe('Acme')
    expect(pub!.position).toBe('Engineer')
  })
  it('does not expose a non-public profile (slug 404s)', async () => {
    const pub = await call(ctx(undefined, 'applicant', false)).profile.getPublic({ slug: `${RUN}-bob` })
    expect(pub).toBeNull()
  })
})

describe('participant-scope — contracts', () => {
  let contractId: string
  beforeAll(async () => {
    const c = await prisma.contract.create({ data: { clientUserId: ALICE, contractorUserId: BOB, title: 'Build a thing', rateType: 'hourly', rateAmount: 100 } })
    contractId = c.id
  })
  it('a participant can read the contract', async () => {
    const v = await call(ctx(BOB, 'contractor')).contracts.get({ contractId })
    expect(v?.contractorUserId).toBe(BOB)
  })
  it('a non-participant gets null — existence is hidden', async () => {
    const v = await call(ctx(CAROL, 'contractor')).contracts.get({ contractId })
    expect(v).toBeNull()
  })
  it('a non-participant cannot change the contract status', async () => {
    const r = await call(ctx(CAROL, 'contractor')).contracts.updateStatus({ contractId, status: 'paused' })
    expect(r).toEqual({ error: 'forbidden' })
  })
})

describe('chat rooms — direct (contractor↔contractor)', () => {
  let roomId: string
  beforeAll(async () => {
    const opened = (await call(ctx(ALICE, 'contractor')).dm.open({ userId: BOB })) as { roomId: string }
    roomId = opened.roomId
    await call(ctx(ALICE, 'contractor')).dm.send({ roomId, body: 'hey bob' })
  })
  it('open is idempotent per the unordered pair', async () => {
    const again = (await call(ctx(BOB, 'contractor')).dm.open({ userId: ALICE })) as { roomId: string }
    expect(again.roomId).toBe(roomId)
  })
  it('a participant can read the room; a non-participant is blocked', async () => {
    expect(await call(ctx(BOB, 'contractor')).dm.messages({ roomId })).not.toHaveProperty('error')
    expect(await call(ctx(CAROL, 'contractor')).dm.messages({ roomId })).toHaveProperty('error')
  })
})

describe('chat rooms — provider hire/team + tenant-ref gate + join-gating', () => {
  let hireRoom: string
  it('openHireRoom is idempotent per (tenant, contractor) and the contractor sees it', async () => {
    const a = (await call(SVC).dm.provider.openHireRoom({ tenantRef: TENANT, orgLabel: 'Acme Corp', contractorUserId: ALICE })) as { roomId: string }
    const b = (await call(SVC).dm.provider.openHireRoom({ tenantRef: TENANT, orgLabel: 'Acme Corp', contractorUserId: ALICE })) as { roomId: string }
    expect(b.roomId).toBe(a.roomId)
    hireRoom = a.roomId
    const rooms = await call(ctx(ALICE, 'contractor')).dm.rooms()
    expect(rooms.find((r) => r.roomId === hireRoom)?.title).toBe('Acme Corp') // contractor sees the org label
  })
  it('the wrong tenantRef cannot read the room', async () => {
    expect(await call(SVC).dm.provider.listMessages({ tenantRef: uid('other-tenant'), roomId: hireRoom, userId: 'member-1' })).toEqual({ error: 'forbidden' })
  })
  it('a tenant member message is attributed Name·Org on the contractor side', async () => {
    await call(SVC).dm.provider.send({ tenantRef: TENANT, roomId: hireRoom, senderUserId: 'member-1', senderLabel: 'Jane', body: 'hi alice' })
    const r = (await call(ctx(ALICE, 'contractor')).dm.messages({ roomId: hireRoom })) as { messages: Array<{ fromTenant: boolean; senderLabel: string }> }
    const tenantMsg = r.messages.find((m) => m.fromTenant)
    expect(tenantMsg?.senderLabel).toBe('Jane')
  })
  it('a contractor added to a team room sees only post-join history (join-gated)', async () => {
    const team = (await call(SVC).dm.provider.openTeamRoom({ tenantRef: TENANT, orgLabel: 'Acme Corp', contractorUserIds: [ALICE], title: 'Project X' })) as { roomId: string }
    await call(ctx(ALICE, 'contractor')).dm.send({ roomId: team.roomId, body: 'before bob joins' })
    await call(SVC).dm.provider.addParticipant({ tenantRef: TENANT, roomId: team.roomId, contractorUserId: BOB })
    await call(ctx(ALICE, 'contractor')).dm.send({ roomId: team.roomId, body: 'after bob joins' })
    const bobView = (await call(ctx(BOB, 'contractor')).dm.messages({ roomId: team.roomId })) as { messages: Array<{ body: string }> }
    const bodies = bobView.messages.map((m) => m.body)
    expect(bodies).toContain('after bob joins')
    expect(bodies).not.toContain('before bob joins')
  })
})

describe('user-scope-isolation', () => {
  it('an update mutates ONLY the calling user — never another user', async () => {
    await call(ctx(ALICE, 'contractor')).profile.update({ headline: 'Alice headline' })
    const bob = await prisma.contractorProfile.findUnique({ where: { clerkUserId: BOB }, select: { headline: true } })
    expect(bob?.headline).not.toBe('Alice headline')
    const alice = await call(ctx(ALICE, 'contractor')).profile.getOwn()
    expect(alice.profile?.headline).toBe('Alice headline')
  })
  it("getOwn returns the caller's own profile, not another user's", async () => {
    const own = await call(ctx(BOB, 'contractor')).profile.getOwn()
    expect(own.profile?.displayName).toBe('Bob Baker')
  })
})

describe('time disputes + verification', () => {
  // ALICE = client (contract owner), BOB = contractor (owner of the time), CAROL = unrelated third party.
  const BILLED_CYCLE = '00000000-0000-0000-0000-0000000000aa'
  let contractId: string
  let manualEntry: string
  let timerEntry: string
  beforeAll(async () => {
    const c = await prisma.contract.create({ data: { clientUserId: ALICE, contractorUserId: BOB, title: 'Time work', rateType: 'hourly', rateAmount: 100 } })
    contractId = c.id
    const m = await prisma.timeEntry.create({ data: { contractId, contractorUserId: BOB, startedAt: new Date(Date.now() - 7200_000), endedAt: new Date(Date.now() - 3600_000), durationSeconds: 3600, source: 'manual' } })
    manualEntry = m.id
    const t = await prisma.timeEntry.create({ data: { contractId, contractorUserId: BOB, startedAt: new Date(Date.now() - 3600_000), endedAt: new Date(), durationSeconds: 3600, source: 'timer' } })
    timerEntry = t.id
  })

  it('flags manual entries unverified and timer entries verified', async () => {
    const sum = await call(ctx(ALICE, 'contractor')).time.listTime({ contractId })
    const byId = Object.fromEntries(sum!.entries.map((e) => [e.id, e]))
    expect(byId[manualEntry]!.verified).toBe(false)
    expect(byId[timerEntry]!.verified).toBe(true)
  })

  it('the client can dispute an entry; a non-participant cannot', async () => {
    expect(await call(ctx(ALICE, 'contractor')).time.dispute({ entryId: manualEntry, reason: 'hours look high' })).toEqual({ ok: true })
    const sum = await call(ctx(ALICE, 'contractor')).time.listTime({ contractId })
    const e = sum!.entries.find((x) => x.id === manualEntry)!
    expect(e.disputed).toBe(true)
    expect(e.disputeReason).toBe('hours look high')
    expect(sum!.disputedSeconds).toBe(3600)
    expect(await call(ctx(CAROL, 'contractor')).time.dispute({ entryId: timerEntry, reason: 'nope' })).toEqual({ error: 'forbidden' })
  })

  it('approving a disputed entry clears the dispute and makes it billable', async () => {
    expect(await call(ctx(ALICE, 'contractor')).time.approve({ entryId: manualEntry })).toEqual({ ok: true })
    const e = (await call(ctx(ALICE, 'contractor')).time.listTime({ contractId }))!.entries.find((x) => x.id === manualEntry)!
    expect(e.disputed).toBe(false)
    expect(e.approved).toBe(true)
  })

  it('the contractor can delete own tracked time; a non-owner cannot', async () => {
    expect(await call(ctx(ALICE, 'contractor')).time.deleteEntry({ entryId: timerEntry })).toEqual({ error: 'forbidden' }) // ALICE is the client, not the owner
    expect(await call(ctx(BOB, 'contractor')).time.deleteEntry({ entryId: timerEntry })).toEqual({ ok: true })
    const sum = await call(ctx(BOB, 'contractor')).time.listTime({ contractId })
    expect(sum!.entries.find((x) => x.id === timerEntry)).toBeUndefined()
  })

  it('a billed entry refuses dispute and delete', async () => {
    const billed = await prisma.timeEntry.create({ data: { contractId, contractorUserId: BOB, startedAt: new Date(Date.now() - 1800_000), endedAt: new Date(), durationSeconds: 1800, source: 'timer', approved: true, approvedAt: new Date(), billingCycleId: BILLED_CYCLE } })
    expect(await call(ctx(ALICE, 'contractor')).time.dispute({ entryId: billed.id, reason: 'too late' })).toEqual({ error: 'already_billed' })
    expect(await call(ctx(BOB, 'contractor')).time.deleteEntry({ entryId: billed.id })).toEqual({ error: 'already_billed' })
  })
})
