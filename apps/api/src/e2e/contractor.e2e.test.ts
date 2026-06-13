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

// the players
const ALICE = uid('alice') // vetted contractor (public profile)
const BOB = uid('bob') // vetted contractor (non-public profile)
const CAROL = uid('carol') // vetted contractor — the third-party non-participant
const PAT = uid('pat') // applicant — NOT vetted
const ADMIN = uid('admin') // platform_admin

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
  await prisma.dmMessage.deleteMany({ where: { senderUserId: { in: users } } })
  await prisma.dmThread.deleteMany({ where: { OR: [{ userAUserId: { in: users } }, { userBUserId: { in: users } }] } })
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

describe('participant-scope — DMs', () => {
  let threadId: string
  beforeAll(async () => {
    const opened = (await call(ctx(ALICE, 'contractor')).dm.open({ userId: BOB })) as { threadId: string }
    threadId = opened.threadId
    await call(ctx(ALICE, 'contractor')).dm.send({ threadId, body: 'hey bob' })
  })
  it('a participant can read the thread', async () => {
    const r = await call(ctx(BOB, 'contractor')).dm.messages({ threadId })
    expect(r).not.toHaveProperty('error')
  })
  it('a non-participant is blocked', async () => {
    const r = await call(ctx(CAROL, 'contractor')).dm.messages({ threadId })
    expect(r).toHaveProperty('error')
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
