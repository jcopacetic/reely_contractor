'use server'

/**
 * Platform-admin vetting actions — the queue surface calls these. Every one re-checks `role==='admin'`
 * from the Clerk session (never trust the client); the contractor api ALSO enforces `adminProcedure`, so
 * this is defense-in-depth + a clean error. The api mutations mirror the `contractor` flag to Clerk on
 * approve/suspend (see contractor-identity store), which is what the nav + middleware gate on.
 */
import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { apiMutate } from '@/lib/api'

type Result = { ok?: true; error?: string }

async function isAdmin(): Promise<boolean> {
  const { userId, sessionClaims } = await auth()
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role
  return Boolean(userId) && role === 'admin'
}

async function adminMutate(proc: string, input: unknown): Promise<Result> {
  if (!(await isAdmin())) return { error: 'Admins only.' }
  try {
    const r = await apiMutate<Result>(proc, input)
    revalidatePath('/contractor/admin')
    return r && 'error' in r && r.error ? { error: r.error } : { ok: true }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/** Approve an applicant → vetted + the Clerk contractor flag (they can enter the club immediately). */
export async function approveApplicantAction(userId: string): Promise<Result> {
  return adminMutate('identity.approve', { userId })
}

/** Reject an applicant (Clerk flag cleared; they can re-apply later). */
export async function rejectApplicantAction(userId: string): Promise<Result> {
  return adminMutate('identity.reject', { userId })
}

/** Disable a vetted contractor (governance kill-switch — reason + cascade: stop timers, alert their clients). */
export async function suspendContractorAction(userId: string, reason: string, note?: string): Promise<Result> {
  return adminMutate('governance.suspendContractor', { contractorUserId: userId, reason, ...(note ? { note } : {}) })
}

/** Reinstate a disabled contractor (notifies them + their clients it's back on). */
export async function reinstateContractorAction(userId: string): Promise<Result> {
  return adminMutate('governance.reinstateContractor', { contractorUserId: userId })
}

/** Suspend a client's contracting (kill-switch — reason + cascade: stop timers, disable contracts, notify both sides). */
export async function suspendClientAction(clientUserId: string, reason: string, note?: string): Promise<Result> {
  return adminMutate('governance.suspendClient', { clientUserId, reason, ...(note ? { note } : {}) })
}

/** Restore a suspended client's contracting. */
export async function reinstateClientAction(clientUserId: string): Promise<Result> {
  return adminMutate('governance.reinstateClient', { clientUserId })
}

/** Fire the weekly billing tick on demand (testing + ops). Enqueues the same job the Sunday cron runs. */
export async function runBillingCycleAction(): Promise<Result> {
  return adminMutate('payments.runBillingCycle', {})
}

/** Mint an invite code for an email (admin shares it; the applicant redeems on /contractor/apply). */
export async function createInviteAction(email: string): Promise<{ code?: string; error?: string }> {
  if (!(await isAdmin())) return { error: 'Admins only.' }
  try {
    const r = await apiMutate<{ code?: string; inviteId?: string; error?: string }>('identity.createInvite', { email })
    if (r && 'error' in r && r.error) return { error: r.error }
    return { code: r?.code }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
