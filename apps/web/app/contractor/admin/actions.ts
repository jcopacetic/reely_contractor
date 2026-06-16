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

/** Suspend a vetted contractor (revokes club access). */
export async function suspendContractorAction(userId: string): Promise<Result> {
  return adminMutate('identity.suspend', { userId })
}

/** Reinstate a suspended contractor back to vetted. */
export async function reinstateContractorAction(userId: string): Promise<Result> {
  return adminMutate('identity.reinstate', { userId })
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
