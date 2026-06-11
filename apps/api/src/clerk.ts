/**
 * Clerk contractor-flag mirror. The DB `contractor_identity.status` is authoritative; we ALSO mirror the
 * vetted state to Clerk `publicMetadata.contractor` (a boolean) so the `/contractor/*` middleware + the
 * marketing "Contractor" nav link can gate cheaply on the session claim. IMPORTANT: this is a SEPARATE key
 * from the portfolio-wide `role` (admin) — overwriting `role` would clobber a staff user's admin everywhere.
 * A user can be both an admin and a vetted contractor. On approve → contractor=true; on suspend/reject →
 * cleared. updateUserMetadata shallow-merges, so other publicMetadata keys (incl. `role`) are untouched.
 * No-ops when CLERK_SECRET_KEY is unset (local dev).
 */
import { createClerkClient } from '@clerk/backend'
import { env } from './env'

const clerk = env.CLERK_SECRET_KEY ? createClerkClient({ secretKey: env.CLERK_SECRET_KEY }) : null

export async function setContractorFlag(clerkUserId: string, on: boolean): Promise<void> {
  if (!clerk) return
  await clerk.users.updateUserMetadata(clerkUserId, {
    publicMetadata: { contractor: on ? true : null },
  })
}
