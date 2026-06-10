/**
 * contractor-identity store — the vetting state machine (applicant → vetted → suspended) and the invite
 * system. Foundational: every privileged write elsewhere checks `vettedProcedure` (DB-authoritative).
 * On approve/suspend we also mirror the role to Clerk (setContractorRole) so the nav + middleware gate
 * cheaply. Append-only events feed notifications + the admin queue.
 */
import { randomUUID } from 'node:crypto'
import { prisma, ensureIdentity, Prisma, type ActorType } from '@contractor/db'
import { setContractorRole } from '../../clerk'

const INVITE_EXPIRY_DAYS = 30

async function record(type: string, actorId: string, actorType: ActorType, payload: Prisma.InputJsonValue) {
  await prisma.appEvent.create({ data: { source: 'contractor-identity', type, actorId, actorType, payload } })
}

/** A signed-in user applies. Idempotent identity; a fresh application row each submission. */
export async function apply(clerkUserId: string) {
  await ensureIdentity(clerkUserId)
  const application = await prisma.application.create({ data: { clerkUserId, source: 'apply' } })
  await record('application.submitted', clerkUserId, 'applicant', { userId: clerkUserId, source: 'apply' })
  return { applicationId: application.id, status: 'submitted' as const }
}

/** Redeem an invite code → records an invite-sourced application + marks the invite accepted. */
export async function redeemInvite(clerkUserId: string, code: string) {
  const invite = await prisma.invite.findUnique({ where: { code } })
  if (!invite) return { error: 'invalid_code' as const }
  if (invite.status !== 'sent') return { error: 'already_used' as const }
  const ageDays = (Date.now() - invite.createdAt.getTime()) / 86_400_000
  if (ageDays > INVITE_EXPIRY_DAYS) {
    await prisma.invite.update({ where: { id: invite.id }, data: { status: 'expired' } })
    return { error: 'expired' as const }
  }
  await ensureIdentity(clerkUserId)
  await prisma.invite.update({ where: { id: invite.id }, data: { status: 'accepted', acceptedAt: new Date() } })
  const application = await prisma.application.create({ data: { clerkUserId, source: 'invite' } })
  await record('application.submitted', clerkUserId, 'applicant', { userId: clerkUserId, source: 'invite' })
  return { applicationId: application.id, status: 'submitted' as const }
}

/** The applicant's current vetting state for the status page. */
export async function getStatus(clerkUserId: string) {
  const identity = await prisma.contractorIdentity.findUnique({ where: { clerkUserId }, select: { status: true, vettedAt: true } })
  const application = await prisma.application.findFirst({ where: { clerkUserId }, orderBy: { createdAt: 'desc' }, select: { status: true, createdAt: true, decidedAt: true } })
  return { identityStatus: identity?.status ?? null, vettedAt: identity?.vettedAt ?? null, application }
}

// ── Admin ──────────────────────────────────────────────────────────────────────
export async function createInvite(adminId: string, email: string) {
  const code = randomUUID().replace(/-/g, '')
  const invite = await prisma.invite.create({ data: { email, code, invitedBy: adminId } })
  return { inviteId: invite.id, code: invite.code }
}

export async function review(adminId: string, applicationId: string) {
  await prisma.application.update({ where: { id: applicationId }, data: { status: 'in_review', reviewerId: adminId } })
  return { ok: true as const }
}

export async function approve(adminId: string, targetUserId: string) {
  await prisma.contractorIdentity.update({ where: { clerkUserId: targetUserId }, data: { status: 'vetted', vettedAt: new Date() } })
  await prisma.application.updateMany({ where: { clerkUserId: targetUserId, status: { in: ['submitted', 'in_review'] } }, data: { status: 'approved', reviewerId: adminId, decidedAt: new Date() } })
  await setContractorRole(targetUserId, true)
  await record('contractor.approved', adminId, 'admin', { userId: targetUserId })
  return { ok: true as const }
}

export async function reject(adminId: string, targetUserId: string) {
  await prisma.application.updateMany({ where: { clerkUserId: targetUserId, status: { in: ['submitted', 'in_review'] } }, data: { status: 'rejected', reviewerId: adminId, decidedAt: new Date() } })
  await setContractorRole(targetUserId, false)
  await record('contractor.rejected', adminId, 'admin', { userId: targetUserId })
  return { ok: true as const }
}

export async function suspend(adminId: string, targetUserId: string) {
  await prisma.contractorIdentity.update({ where: { clerkUserId: targetUserId }, data: { status: 'suspended' } })
  await setContractorRole(targetUserId, false)
  await record('contractor.suspended', adminId, 'admin', { userId: targetUserId })
  return { ok: true as const }
}

export async function reinstate(adminId: string, targetUserId: string) {
  await prisma.contractorIdentity.update({ where: { clerkUserId: targetUserId }, data: { status: 'vetted', vettedAt: new Date() } })
  await setContractorRole(targetUserId, true)
  await record('contractor.approved', adminId, 'admin', { userId: targetUserId, reinstated: true })
  return { ok: true as const }
}

/** The admin vetting queue: applications awaiting a decision (newest first). */
export async function vettingQueue() {
  return prisma.application.findMany({
    where: { status: { in: ['submitted', 'in_review'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, clerkUserId: true, source: true, status: true, videoLink: true, createdAt: true },
  })
}
