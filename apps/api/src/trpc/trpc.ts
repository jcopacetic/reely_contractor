import { initTRPC, TRPCError } from '@trpc/server'
import { prisma, type DbActor } from '@contractor/db'
import { env, type Env } from '../env'

/**
 * tRPC context + procedures (USER-scoped, no tenant). The trusted web SERVER presents the service key
 * (the trust boundary — the browser never reaches the api) PLUS the verified acting Clerk user + role.
 * Role comes from Clerk publicMetadata.role (mirrored on vetting approval); the DB `contractor_identity.
 * status` stays authoritative for privileged writes (vettedProcedure double-checks it).
 */
export type ActorRole = 'contractor' | 'applicant' | 'platform_admin'

export type ApiContext = {
  clerkUserId?: string
  role: ActorRole // defaults to 'applicant' for any signed-in non-contractor
  serviceCaller: boolean // x-contractor-service-key — the trusted web server + Board provider (Phase 2)
}

/** Resolve the per-request ApiContext from inbound headers. Service gate keys on CONTRACTOR_SERVICE_KEY. */
export function resolveApiContext(
  headers: Record<string, unknown>,
  e: Pick<Env, 'CONTRACTOR_SERVICE_KEY'> = env,
): ApiContext {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  const rawRole = str(headers['x-acting-role'])
  // Clerk's portfolio-wide admin role is `admin`; the contractor manifest's platform_admin maps to clerkRole:admin.
  const role: ActorRole =
    rawRole === 'admin' || rawRole === 'platform_admin'
      ? 'platform_admin'
      : rawRole === 'contractor'
        ? 'contractor'
        : 'applicant'
  const serviceKey = headers['x-contractor-service-key']
  return {
    clerkUserId: str(headers['x-acting-user']),
    role,
    serviceCaller: Boolean(e.CONTRACTOR_SERVICE_KEY) && serviceKey === e.CONTRACTOR_SERVICE_KEY,
  }
}

/** Map the resolved context to the @contractor/db RLS actor (app.actor + app.actor_user GUCs). */
export function actorFor(ctx: ApiContext): DbActor {
  if (!ctx.clerkUserId) return { kind: 'system' }
  if (ctx.role === 'platform_admin') return { kind: 'platform_admin', clerkUserId: ctx.clerkUserId }
  if (ctx.role === 'contractor') return { kind: 'contractor', clerkUserId: ctx.clerkUserId }
  return { kind: 'applicant', clerkUserId: ctx.clerkUserId }
}

const t = initTRPC.context<ApiContext>().create()

export const router = t.router
export const publicProcedure = t.procedure

/** Any signed-in user (applicant or contractor), presented by the trusted web server. */
export const sessionProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.serviceCaller) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'service key required' })
  if (!ctx.clerkUserId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'acting user required' })
  return next({ ctx: { ...ctx, clerkUserId: ctx.clerkUserId } })
})

/** Platform-admin only (vetting queue, category/flag management). */
export const adminProcedure = sessionProcedure.use(({ ctx, next }) => {
  if (ctx.role !== 'platform_admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'platform_admin required' })
  return next({ ctx })
})

/**
 * Vetted-contractor gate — the hard gate every privileged contractor write checks. Verifies the
 * DB-authoritative `contractor_identity.status === 'vetted'` (not just the mirrored header role).
 */
export const vettedProcedure = sessionProcedure.use(async ({ ctx, next }) => {
  const identity = await prisma.contractorIdentity.findUnique({
    where: { clerkUserId: ctx.clerkUserId },
    select: { status: true },
  })
  if (identity?.status !== 'vetted') throw new TRPCError({ code: 'FORBIDDEN', message: 'vetting required' })
  return next({ ctx })
})

/** Service-key only (Board provider intake, Phase 2). No acting user required. */
export const serviceProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.serviceCaller) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'service key required' })
  return next({ ctx })
})
