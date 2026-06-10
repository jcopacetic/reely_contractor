/**
 * @contractor/db — Prisma client for the Contractor node (USER-SCOPED, no tenant).
 *
 * A single shared instance (hot-reload safe in dev). Isolation keys on Postgres GUCs set per request by
 * `withUser`: `app.actor_user` (the Clerk user id) + `app.actor` (role). RLS policies (prisma/rls.sql) gate
 * every table on those GUCs (self / participant / admin / system). The api builds its ModuleContext db
 * surface on top of this; raw `prisma` (no GUC) runs unscoped (dev/system) until RLS is applied + a request
 * binds an actor.
 *
 * NOTE (scaffold): the GUC plumbing is the baseline mechanism; each module session hardens its policy bodies
 * and the participant predicates per the manifest's acceptanceCriteria.
 */
import { PrismaClient, Prisma } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/** The session actor for RLS (`app.actor` + `app.actor_user`). The User is never a local table. */
export type DbActor =
  | { kind: 'contractor' | 'applicant'; clerkUserId: string }
  | { kind: 'platform_admin'; clerkUserId: string }
  | { kind: 'system' }

/**
 * Run `fn` inside a transaction with the actor GUCs set (SET LOCAL via set_config → scoped to the txn).
 * RLS then enforces user/participant isolation. Pass the per-request actor resolved from Clerk identity.
 */
export async function withUser<T>(actor: DbActor, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const userId = 'clerkUserId' in actor ? actor.clerkUserId : ''
    await tx.$executeRawUnsafe(`select set_config('app.actor', $1, true)`, actor.kind)
    await tx.$executeRawUnsafe(`select set_config('app.actor_user', $1, true)`, userId)
    return fn(tx)
  })
}

/**
 * Ensure a `contractor_identity` row exists for a Clerk user (idempotent). New users land as `applicant`.
 * Returns the identity id + status. The vetting state machine (approve/suspend) lives in contractor-identity.
 */
export async function ensureIdentity(clerkUserId: string) {
  return prisma.contractorIdentity.upsert({
    where: { clerkUserId },
    update: {},
    create: { clerkUserId },
    select: { id: true, status: true },
  })
}

export * from '@prisma/client'
