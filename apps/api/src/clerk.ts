/**
 * Clerk role mirror. The DB `contractor_identity.status` is authoritative, but we also mirror the vetted
 * state to Clerk `publicMetadata.role` so the marketing "Contractor" nav link + the `/contractor/*`
 * middleware can gate cheaply on the session claim (no DB round-trip). On approve → role='contractor';
 * on suspend/reject → role cleared. No-ops when CLERK_SECRET_KEY is unset (local dev).
 */
import { createClerkClient } from '@clerk/backend'
import { env } from './env'

const clerk = env.CLERK_SECRET_KEY ? createClerkClient({ secretKey: env.CLERK_SECRET_KEY }) : null

export async function setContractorRole(clerkUserId: string, on: boolean): Promise<void> {
  if (!clerk) return
  await clerk.users.updateUserMetadata(clerkUserId, {
    publicMetadata: { role: on ? 'contractor' : null },
  })
}
