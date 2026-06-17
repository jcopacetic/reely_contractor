/**
 * ledger — the immutable, append-only financial record. The charge/payout engine calls recordLedger() at each
 * money event (a settled cycle charge, a declined charge, a chargeback); each row is fully attributed (who /
 * where / what / why / when) + carries the Stripe ids so it's reconcilable against Stripe forever. Writes are
 * idempotent (idempotencyKey) and best-effort from the engine's view — a ledger hiccup logs but never rolls back
 * a completed charge (the charge/payout rows + Stripe remain the operational truth it can be rebuilt from).
 * Participants READ their own rows (RLS select); only the system writes.
 */
import { prisma } from '@contractor/db'

type Kind = 'charge' | 'charge_failed' | 'refund' | 'chargeback' | 'adjustment'

export type RecordInput = {
  kind: Kind
  cycleId: string
  clientUserId: string
  contractorUserId: string
  gross: number
  fee: number
  net: number
  chargeId?: string | null
  stripePaymentIntentId?: string | null
  stripeTransferId?: string | null
  succeeded?: boolean
  failureReason?: string | null
  description: string
  idempotencyKey: string
}

/** Append one immutable ledger row for a money event (idempotent on idempotencyKey). Best-effort: never throws. */
export async function recordLedger(input: RecordInput): Promise<void> {
  try {
    const cycle = await prisma.billingCycle.findUnique({
      where: { id: input.cycleId },
      select: { periodStart: true, periodEnd: true, totalSeconds: true, contract: { select: { id: true, boardRef: true } }, _count: { select: { entries: true } } },
    })
    await prisma.ledgerEntry.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {}, // append-only — a duplicate event is a no-op
      create: {
        kind: input.kind,
        clientUserId: input.clientUserId,
        contractorUserId: input.contractorUserId,
        contractId: cycle?.contract.id ?? null,
        boardRef: cycle?.contract.boardRef ?? null,
        billingCycleId: input.cycleId,
        chargeId: input.chargeId ?? null,
        grossAmount: input.gross,
        feeAmount: input.fee,
        netAmount: input.net,
        description: input.description,
        periodStart: cycle?.periodStart ?? null,
        periodEnd: cycle?.periodEnd ?? null,
        taskCount: cycle?._count.entries ?? 0,
        totalSeconds: cycle?.totalSeconds ?? 0,
        stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        stripeTransferId: input.stripeTransferId ?? null,
        succeeded: input.succeeded ?? true,
        failureReason: input.failureReason ?? null,
        occurredAt: new Date(),
        idempotencyKey: input.idempotencyKey,
      },
    })
  } catch (e) {
    console.error('[ledger] record failed', input.idempotencyKey, (e as Error).message)
  }
}

// ── reads (the per-party transaction record) ─────────────────────────────────────────────
export type LedgerView = {
  id: string
  kind: Kind
  contractId: string | null
  boardRef: string | null
  grossAmount: number
  feeAmount: number
  netAmount: number
  currency: string
  description: string
  periodStart: string | null
  periodEnd: string | null
  taskCount: number
  totalSeconds: number
  succeeded: boolean
  failureReason: string | null
  occurredAt: string
}

export type Row = { id: string; kind: string; contractId: string | null; boardRef: string | null; grossAmount: unknown; feeAmount: unknown; netAmount: unknown; currency: string; description: string; periodStart: Date | null; periodEnd: Date | null; taskCount: number; totalSeconds: number; succeeded: boolean; failureReason: string | null; occurredAt: Date }

export function toView(r: Row): LedgerView {
  return {
    id: r.id,
    kind: r.kind as Kind,
    contractId: r.contractId,
    boardRef: r.boardRef,
    grossAmount: Number(r.grossAmount),
    feeAmount: Number(r.feeAmount),
    netAmount: Number(r.netAmount),
    currency: r.currency,
    description: r.description,
    periodStart: r.periodStart ? r.periodStart.toISOString() : null,
    periodEnd: r.periodEnd ? r.periodEnd.toISOString() : null,
    taskCount: r.taskCount,
    totalSeconds: r.totalSeconds,
    succeeded: r.succeeded,
    failureReason: r.failureReason,
    occurredAt: r.occurredAt.toISOString(),
  }
}

const SELECT = { id: true, kind: true, contractId: true, boardRef: true, grossAmount: true, feeAmount: true, netAmount: true, currency: true, description: true, periodStart: true, periodEnd: true, taskCount: true, totalSeconds: true, succeeded: true, failureReason: true, occurredAt: true } as const

/** The contractor's own transactions (what they earned). Vetted. */
export async function ledgerForContractor(contractorUserId: string, limit = 200): Promise<LedgerView[]> {
  const rows = await prisma.ledgerEntry.findMany({ where: { contractorUserId }, orderBy: { occurredAt: 'desc' }, take: limit, select: SELECT })
  return rows.map(toView)
}

/** A Board-originated contract's transactions, for the client side (boardRef-scoped). */
export async function providerLedgerForContract(contractRef: string): Promise<LedgerView[] | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractRef }, select: { boardRef: true } })
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  const rows = await prisma.ledgerEntry.findMany({ where: { contractId: contractRef }, orderBy: { occurredAt: 'desc' }, take: 200, select: SELECT })
  return rows.map(toView)
}
