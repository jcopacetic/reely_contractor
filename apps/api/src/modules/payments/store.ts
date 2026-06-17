/**
 * payments store — the weekly billing engine. A `billing_cycle` per (contract, period) sweeps APPROVED, un-billed,
 * un-disputed time; after the dispute window it charges the client + pays the contractor (net = gross − take_rate),
 * platform-initiated, NOT escrow. Stripe is stubbed when unset (the cycle/charge/payout DB state is authoritative);
 * in live mode the webhook flips charge→succeeded + opens the payout. Only approved time bills.
 */
import type Stripe from 'stripe'
import { prisma } from '@contractor/db'
import { emit } from '../../events'
import { env } from '../../env'
import { createConnectAccount, onboardingLink, accountStatus, chargeClient, transferToContractor, stripeConfigured, createCustomer, createSetupIntent, createSetupCheckout, attachDefaultPaymentMethod } from '../../clients/stripe'
import { recordLedger } from './ledger'
import { autoSuspendClientOnDecline } from '../governance/store'

export const DISPUTE_WINDOW_DAYS = 7
const round2 = (n: number) => Math.round(n * 100) / 100
const cents = (n: number) => Math.round(n * 100)

// ── contractor Connect onboarding ───────────────────────────────────────────────────
/** The contractor's payout (Connect) account status, or null if they haven't started onboarding. */
export async function myPayoutAccount(contractorUserId: string) {
  const a = await prisma.stripeAccount.findUnique({ where: { contractorUserId }, select: { stripeAccountId: true, chargesEnabled: true, payoutsEnabled: true, kycStatus: true } })
  if (!a) return { connected: false as const, configured: stripeConfigured() }
  return { connected: true as const, configured: stripeConfigured(), payoutsEnabled: a.payoutsEnabled, chargesEnabled: a.chargesEnabled, kycStatus: a.kycStatus }
}

/** Ensure a Connect Express account for the contractor + return an onboarding link to complete KYC. */
export async function startOnboarding(contractorUserId: string): Promise<{ url: string }> {
  let acct = await prisma.stripeAccount.findUnique({ where: { contractorUserId }, select: { stripeAccountId: true } })
  if (!acct) {
    const created = await createConnectAccount(contractorUserId)
    acct = await prisma.stripeAccount.create({ data: { contractorUserId, stripeAccountId: created.accountId }, select: { stripeAccountId: true } })
  }
  return { url: await onboardingLink(acct.stripeAccountId) }
}

/** Refresh the contractor's Connect capabilities from Stripe (also reconciled by the webhook). */
export async function refreshAccount(contractorUserId: string): Promise<void> {
  const acct = await prisma.stripeAccount.findUnique({ where: { contractorUserId }, select: { stripeAccountId: true } })
  if (!acct) return
  const st = await accountStatus(acct.stripeAccountId)
  await prisma.stripeAccount.update({ where: { contractorUserId }, data: { chargesEnabled: st.chargesEnabled, payoutsEnabled: st.payoutsEnabled, kycStatus: st.kyc } })
}

// ── the cycle: sweep approved time → charge after the window ──────────────────────────
type CycleView = { id: string; periodStart: string; periodEnd: string; status: string; totalSeconds: number; totalAmount: number; takeRateAmount: number; disputeWindowEndsAt: string; chargedAt: string | null; chargeStatus: string | null; payoutStatus: string | null; openDispute: boolean }

/** Sweep a contract's approved, un-billed, un-disputed time into the period's cycle (idempotent on contract+period). */
export async function sweepCycle(contractId: string, periodStart: Date, periodEnd: Date): Promise<{ cycleId: string; totalSeconds: number } | null> {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { rateType: true, rateAmount: true, contractorUserId: true } })
  if (!contract) return null
  const unbilled = await prisma.timeEntry.findMany({ where: { contractId, approved: true, disputed: false, billingCycleId: null, endedAt: { not: null } }, select: { id: true } })
  const existing = await prisma.billingCycle.findUnique({ where: { contractId_periodStart: { contractId, periodStart } }, select: { id: true, status: true } })
  if (unbilled.length === 0 && !existing) return null
  if (existing && (existing.status === 'charged' || existing.status === 'voided')) return null // already settled
  // The dispute window opens when the cycle is presented (period end), not when the period started — so the
  // client always gets the full 7 days to contest before the charge, regardless of when in the week we swept.
  const cycle = existing ?? (await prisma.billingCycle.create({ data: { contractId, periodStart, periodEnd, status: 'dispute_window', disputeWindowEndsAt: new Date(periodEnd.getTime() + DISPUTE_WINDOW_DAYS * 86_400_000) }, select: { id: true, status: true } }))
  if (unbilled.length) await prisma.timeEntry.updateMany({ where: { id: { in: unbilled.map((e) => e.id) } }, data: { billingCycleId: cycle.id } })
  const agg = await prisma.timeEntry.aggregate({ where: { billingCycleId: cycle.id }, _sum: { durationSeconds: true } })
  const totalSeconds = agg._sum.durationSeconds ?? 0
  const rate = Number(contract.rateAmount)
  const totalAmount = round2(contract.rateType === 'hourly' ? (totalSeconds / 3600) * rate : rate)
  await prisma.billingCycle.update({ where: { id: cycle.id }, data: { totalSeconds, totalAmount, takeRateAmount: round2((totalAmount * env.PLATFORM_TAKE_RATE_PCT) / 100) } })
  if (!existing) await emit('payments', 'cycle.opened', contract.contractorUserId, { contractId, cycleId: cycle.id }, 'system')
  return { cycleId: cycle.id, totalSeconds }
}

/** Charge cycles past their dispute window with no open dispute + no disputed entry. Stub → settles synchronously. */
export async function chargeDueCycles(now = new Date()): Promise<{ charged: number }> {
  const due = await prisma.billingCycle.findMany({
    where: { status: 'dispute_window', disputeWindowEndsAt: { lte: now }, charge: null, disputes: { none: { status: 'open' } }, entries: { none: { disputed: true } } },
    select: { id: true, totalAmount: true, takeRateAmount: true, contract: { select: { clientUserId: true, contractorUserId: true } } },
  })
  let charged = 0
  for (const c of due) {
    const gross = Number(c.totalAmount)
    if (gross <= 0) {
      await prisma.billingCycle.update({ where: { id: c.id }, data: { status: 'voided' } })
      continue
    }
    const take = Number(c.takeRateAmount)
    const net = round2(gross - take)
    const idempotencyKey = `cycle:${c.id}`
    const live = stripeConfigured()
    // Charge the client's saved card off-session. Stub mode ignores the card and always "succeeds".
    const billing = live ? await prisma.clientBilling.findUnique({ where: { clientUserId: c.contract.clientUserId }, select: { stripeCustomerId: true, defaultPaymentMethodId: true, status: true } }) : null
    const hasCard = billing?.status === 'ready' && !!billing.defaultPaymentMethodId
    const res = await chargeClient({
      clientUserId: c.contract.clientUserId,
      customerId: hasCard ? billing!.stripeCustomerId : null,
      paymentMethodId: hasCard ? billing!.defaultPaymentMethodId : null,
      amountCents: cents(gross),
      idempotencyKey,
      description: `Reely contractor work — cycle ${c.id}`,
    })
    if (res.status === 'no_payment_method') {
      // No card on file — leave the cycle in its window; it bills on a later tick once the client adds one.
      await emit('payments', 'charge.awaiting_payment_method', c.contract.clientUserId, { cycleId: c.id }, 'system')
      continue
    }
    const chargeStatus = !live ? 'succeeded' : res.status === 'failed' ? 'failed' : 'pending'
    const charge = await prisma.charge.create({
      data: { billingCycleId: c.id, stripePaymentIntentId: res.paymentIntentId, clientUserId: c.contract.clientUserId, contractorUserId: c.contract.contractorUserId, grossAmount: gross, takeRateAmount: take, netAmount: net, status: chargeStatus, idempotencyKey, succeededAt: chargeStatus === 'succeeded' ? new Date() : null },
      select: { id: true },
    })
    if (!live) {
      // Stub: no webhook to complete it, so settle the payout + cycle now.
      const acct = await prisma.stripeAccount.findUnique({ where: { contractorUserId: c.contract.contractorUserId }, select: { stripeAccountId: true } })
      const tr = await transferToContractor({ accountId: acct?.stripeAccountId ?? `acct_stub_${c.contract.contractorUserId}`, amountCents: cents(net), idempotencyKey })
      await prisma.payout.create({ data: { chargeId: charge.id, stripeTransferId: tr.transferId, contractorUserId: c.contract.contractorUserId, amount: net, status: 'paid' } })
      await prisma.billingCycle.update({ where: { id: c.id }, data: { status: 'charged', chargedAt: new Date() } })
      await recordLedger({ kind: 'charge', cycleId: c.id, clientUserId: c.contract.clientUserId, contractorUserId: c.contract.contractorUserId, gross, fee: take, net, chargeId: charge.id, stripePaymentIntentId: res.paymentIntentId, stripeTransferId: tr.transferId, succeeded: true, description: `Weekly contractor work — cycle ${c.id}`, idempotencyKey: `ledger:charge:${charge.id}` })
      await emit('payments', 'payment.charged', c.contract.contractorUserId, { cycleId: c.id, net }, 'system')
    }
    // Live: the charge row (pending) excludes the cycle from re-charging; the webhook flips it on payment_intent.succeeded.
    charged++
  }
  return { charged }
}

// ── participant reads + cycle disputes ────────────────────────────────────────────────
async function isParticipant(contractId: string, userId: string): Promise<boolean> {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, select: { clientUserId: true, contractorUserId: true } })
  return !!c && (c.clientUserId === userId || c.contractorUserId === userId)
}

/** Load a contract's cycles as views (no access check — callers gate first). */
async function loadCycleViews(contractId: string): Promise<CycleView[]> {
  const rows = await prisma.billingCycle.findMany({
    where: { contractId },
    orderBy: { periodStart: 'desc' },
    take: 100,
    select: { id: true, periodStart: true, periodEnd: true, status: true, totalSeconds: true, totalAmount: true, takeRateAmount: true, disputeWindowEndsAt: true, chargedAt: true, charge: { select: { status: true, payout: { select: { status: true } } } }, disputes: { where: { status: 'open' }, select: { id: true } } },
  })
  return rows.map((r) => ({
    id: r.id,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    status: r.status,
    totalSeconds: r.totalSeconds,
    totalAmount: Number(r.totalAmount),
    takeRateAmount: Number(r.takeRateAmount),
    disputeWindowEndsAt: r.disputeWindowEndsAt.toISOString(),
    chargedAt: r.chargedAt ? r.chargedAt.toISOString() : null,
    chargeStatus: r.charge?.status ?? null,
    payoutStatus: r.charge?.payout?.status ?? null,
    openDispute: r.disputes.length > 0,
  }))
}

/** A contract's billing cycles (participant-gated) with charge/payout/dispute status. */
export async function listCycles(viewerUserId: string, contractId: string): Promise<CycleView[] | null> {
  if (!(await isParticipant(contractId, viewerUserId))) return null
  return loadCycleViews(contractId)
}

/** A Board-originated contract's billing cycles, for Board (the client side). Scoped: only contracts carrying a boardRef. */
export async function providerListCycles(contractRef: string): Promise<CycleView[] | { error: string }> {
  const c = await prisma.contract.findUnique({ where: { id: contractRef }, select: { boardRef: true } })
  if (!c) return { error: 'not_found' }
  if (!c.boardRef) return { error: 'forbidden' }
  return loadCycleViews(contractRef)
}

// ── client card-on-file (Board calls these via payments.provider.*) ─────────────────────
/** Ensure the client has a Stripe customer, then return a SetupIntent client secret to collect + save a card
 *  (off-session, for the weekly cycle charges). Idempotent on the stored customer; the card lands via the
 *  setup_intent.succeeded webhook. */
export async function ensureClientSetupIntent(clientUserId: string, email?: string): Promise<{ clientSecret: string }> {
  let billing = await prisma.clientBilling.findUnique({ where: { clientUserId }, select: { stripeCustomerId: true } })
  if (!billing) {
    const { customerId } = await createCustomer(clientUserId, email)
    billing = await prisma.clientBilling.create({ data: { clientUserId, stripeCustomerId: customerId }, select: { stripeCustomerId: true } })
  }
  const si = await createSetupIntent(billing.stripeCustomerId)
  return { clientSecret: si.clientSecret }
}

/** Ensure the client's Stripe customer, then return a hosted Checkout (setup-mode) URL to collect + save a card.
 *  The simplest collection path — no frontend Stripe deps; the card lands via the setup_intent.succeeded webhook. */
export async function ensureClientSetupCheckout(clientUserId: string, email: string | undefined, returnUrl: string): Promise<{ url: string }> {
  let billing = await prisma.clientBilling.findUnique({ where: { clientUserId }, select: { stripeCustomerId: true } })
  if (!billing) {
    const { customerId } = await createCustomer(clientUserId, email)
    billing = await prisma.clientBilling.create({ data: { clientUserId, stripeCustomerId: customerId }, select: { stripeCustomerId: true } })
  }
  return createSetupCheckout(billing.stripeCustomerId, returnUrl)
}

/** Whether a client has a saved card on file (+ brand/last4 for display). Board shows "card on file" or prompts. */
export async function clientBillingStatus(clientUserId: string): Promise<{ hasCardOnFile: boolean; brand: string | null; last4: string | null }> {
  const b = await prisma.clientBilling.findUnique({ where: { clientUserId }, select: { status: true, defaultPaymentMethodId: true, cardBrand: true, cardLast4: true } })
  const hasCardOnFile = !!b && b.status === 'ready' && !!b.defaultPaymentMethodId
  return { hasCardOnFile, brand: b?.cardBrand ?? null, last4: b?.cardLast4 ?? null }
}

/** A participant raises a dispute on a cycle still in its window — blocks the charge until an admin resolves. */
export async function raiseCycleDispute(userId: string, billingCycleId: string, reason: string): Promise<{ ok: true } | { error: string }> {
  const cycle = await prisma.billingCycle.findUnique({ where: { id: billingCycleId }, select: { contractId: true, status: true } })
  if (!cycle) return { error: 'not_found' }
  if (!(await isParticipant(cycle.contractId, userId))) return { error: 'forbidden' }
  if (cycle.status !== 'dispute_window' && cycle.status !== 'open') return { error: 'too_late' }
  await prisma.cycleDispute.create({ data: { billingCycleId, raisedByUserId: userId, reason: reason.trim().slice(0, 2000) } })
  await prisma.billingCycle.update({ where: { id: billingCycleId }, data: { status: 'disputed' } })
  await emit('payments', 'dispute.opened', userId, { billingCycleId }, 'contractor')
  return { ok: true }
}

/** An admin resolves a cycle dispute: allow the charge (back to the window) or void the cycle. */
export async function resolveCycleDispute(disputeId: string, resolution: 'charge' | 'void', note?: string): Promise<{ ok: true } | { error: string }> {
  const d = await prisma.cycleDispute.findUnique({ where: { id: disputeId }, select: { billingCycleId: true, status: true } })
  if (!d) return { error: 'not_found' }
  if (d.status !== 'open') return { error: 'already_resolved' }
  await prisma.cycleDispute.update({ where: { id: disputeId }, data: { status: resolution === 'charge' ? 'resolved_charge' : 'resolved_void', resolutionNote: note?.trim().slice(0, 2000) || null, resolvedAt: new Date() } })
  await prisma.billingCycle.update({ where: { id: d.billingCycleId }, data: { status: resolution === 'charge' ? 'dispute_window' : 'voided' } })
  await emit('payments', 'dispute.resolved', 'system', { billingCycleId: d.billingCycleId, resolution }, 'system')
  return { ok: true }
}

// ── webhook reconciliation (live mode) ────────────────────────────────────────────────
/** Live-mode charge completion: flip the charge to succeeded, mark the cycle charged, then initiate the
 *  contractor payout (transfer). Idempotent — a duplicate succeeded event is a no-op. */
async function markChargeSucceeded(paymentIntentId: string): Promise<void> {
  const charge = await prisma.charge.findFirst({ where: { stripePaymentIntentId: paymentIntentId }, select: { id: true, status: true, billingCycleId: true, clientUserId: true, contractorUserId: true, grossAmount: true, takeRateAmount: true, netAmount: true, idempotencyKey: true } })
  if (!charge || charge.status === 'succeeded') return
  await prisma.charge.update({ where: { id: charge.id }, data: { status: 'succeeded', succeededAt: new Date() } })
  await prisma.billingCycle.update({ where: { id: charge.billingCycleId }, data: { status: 'charged', chargedAt: new Date() } })
  const acct = await prisma.stripeAccount.findUnique({ where: { contractorUserId: charge.contractorUserId }, select: { stripeAccountId: true } })
  const net = Number(charge.netAmount)
  // The transfer to the connected account settles synchronously when created, so the payout is 'paid' at once.
  const tr = await transferToContractor({ accountId: acct?.stripeAccountId ?? `acct_stub_${charge.contractorUserId}`, amountCents: cents(net), idempotencyKey: charge.idempotencyKey })
  await prisma.payout.upsert({ where: { chargeId: charge.id }, update: {}, create: { chargeId: charge.id, stripeTransferId: tr.transferId, contractorUserId: charge.contractorUserId, amount: net, status: 'paid' } })
  await recordLedger({ kind: 'charge', cycleId: charge.billingCycleId, clientUserId: charge.clientUserId, contractorUserId: charge.contractorUserId, gross: Number(charge.grossAmount), fee: Number(charge.takeRateAmount), net, chargeId: charge.id, stripePaymentIntentId: paymentIntentId, stripeTransferId: tr.transferId, succeeded: true, description: `Weekly contractor work — cycle ${charge.billingCycleId}`, idempotencyKey: `ledger:charge:${charge.id}` })
  await emit('payments', 'payment.charged', charge.contractorUserId, { cycleId: charge.billingCycleId, net }, 'system')
}

/**
 * Reconcile DB state from a SIGNATURE-VERIFIED Stripe event (the webhook verifies; this never sees raw input).
 * NEVER initiates a charge — it only mirrors Stripe's truth onto our rows. Every branch is an idempotent update,
 * so duplicate deliveries (Stripe's at-least-once) are safe without an event-id dedup table.
 */
export async function reconcileStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'account.updated': {
      const a = event.data.object as Stripe.Account
      await prisma.stripeAccount.updateMany({
        where: { stripeAccountId: a.id },
        data: { chargesEnabled: Boolean(a.charges_enabled), payoutsEnabled: Boolean(a.payouts_enabled), kycStatus: a.payouts_enabled ? 'verified' : a.requirements?.disabled_reason ? 'restricted' : 'pending' },
      })
      return
    }
    case 'payment_intent.succeeded':
      await markChargeSucceeded((event.data.object as Stripe.PaymentIntent).id)
      return
    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent
      const charge = await prisma.charge.findFirst({ where: { stripePaymentIntentId: pi.id, status: 'pending' }, select: { id: true, billingCycleId: true, clientUserId: true, contractorUserId: true, grossAmount: true, takeRateAmount: true, netAmount: true } })
      if (!charge) return
      await prisma.charge.update({ where: { id: charge.id }, data: { status: 'failed' } })
      const reason = pi.last_payment_error?.decline_code ?? pi.last_payment_error?.code ?? pi.last_payment_error?.message ?? 'declined'
      await recordLedger({ kind: 'charge_failed', cycleId: charge.billingCycleId, clientUserId: charge.clientUserId, contractorUserId: charge.contractorUserId, gross: Number(charge.grossAmount), fee: Number(charge.takeRateAmount), net: Number(charge.netAmount), chargeId: charge.id, stripePaymentIntentId: pi.id, succeeded: false, failureReason: String(reason).slice(0, 200), description: `Charge declined — cycle ${charge.billingCycleId}`, idempotencyKey: `ledger:fail:${charge.id}` })
      // Decline → instant kill-switch: suspend the client (stops timers, disables contracting, notifies both sides).
      await emit('payments', 'charge.failed', charge.clientUserId, { cycleId: charge.billingCycleId, chargeId: charge.id }, 'system')
      await autoSuspendClientOnDecline(charge.clientUserId)
      return
    }
    case 'charge.dispute.created': {
      // A card-level chargeback — flag the charge so ops can void/refund downstream (no auto money movement here).
      const pi = (event.data.object as Stripe.Dispute).payment_intent
      const piId = typeof pi === 'string' ? pi : pi?.id
      if (piId) {
        const charge = await prisma.charge.findFirst({ where: { stripePaymentIntentId: piId }, select: { id: true, billingCycleId: true, clientUserId: true, contractorUserId: true, grossAmount: true, takeRateAmount: true, netAmount: true } })
        await prisma.charge.updateMany({ where: { stripePaymentIntentId: piId }, data: { status: 'refunded' } })
        if (charge) await recordLedger({ kind: 'chargeback', cycleId: charge.billingCycleId, clientUserId: charge.clientUserId, contractorUserId: charge.contractorUserId, gross: Number(charge.grossAmount), fee: Number(charge.takeRateAmount), net: Number(charge.netAmount), chargeId: charge.id, stripePaymentIntentId: piId, succeeded: false, failureReason: 'card dispute / chargeback', description: `Chargeback — cycle ${charge.billingCycleId}`, idempotencyKey: `ledger:chargeback:${charge.id}` })
      }
      return
    }
    case 'setup_intent.succeeded': {
      // The client saved a card — record it as their default payment method for future cycle charges.
      const si = event.data.object as Stripe.SetupIntent
      const customerId = typeof si.customer === 'string' ? si.customer : si.customer?.id
      const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id
      if (customerId && pmId) {
        const card = await attachDefaultPaymentMethod(customerId, pmId)
        await prisma.clientBilling.updateMany({ where: { stripeCustomerId: customerId }, data: { defaultPaymentMethodId: pmId, cardBrand: card.brand, cardLast4: card.last4, status: 'ready' } })
      }
      return
    }
    default:
      return // acknowledged (200) but not acted on
  }
}
