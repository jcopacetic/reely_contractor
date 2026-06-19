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
import { createConnectAccount, onboardingLink, accountStatus, chargeClient, transferToContractor, stripeConfigured, createCustomer, createSetupIntent, createSetupCheckout, attachDefaultPaymentMethod, dashboardLoginLink } from '../../clients/stripe'
import { recordLedger } from './ledger'
import { notifyNow } from '../../notify-now'
import { billableSeconds, pausedIntervalsForContract } from './paused'
import { autoSuspendClientOnDecline } from '../governance/store'
import { notifyDisputeOpened, notifyDisputeResolved } from './disputes'

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

/** A single-use link to the contractor's Stripe Express dashboard (tax forms / 1099s, tax settings, payout
 *  history). Null when they haven't onboarded or Stripe is stubbed. */
export async function dashboardLink(contractorUserId: string): Promise<{ url: string | null }> {
  const a = await prisma.stripeAccount.findUnique({ where: { contractorUserId }, select: { stripeAccountId: true } })
  if (!a) return { url: null }
  return { url: await dashboardLoginLink(a.stripeAccountId).catch(() => null) }
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
  // Bill only un-paused time: while a blocker was open the clock was paused, so any portion of an entry that
  // fell inside a blocker's [raised, resolved] window is excluded from the billable total.
  const cycleEntries = await prisma.timeEntry.findMany({ where: { billingCycleId: cycle.id }, select: { startedAt: true, durationSeconds: true } })
  const paused = await pausedIntervalsForContract(contractId, periodEnd)
  const totalSeconds = cycleEntries.reduce((n, e) => n + billableSeconds(e, paused), 0)
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
      // Needs-action, money-blocking: the contractor can't be paid until a card is on file. Email the client
      // (they live in Board — no deep link, so ctaHref:null), with an in-app row as a backstop.
      await notifyNow(c.contract.clientUserId, {
        type: 'billing.card_needed',
        title: 'Add a payment method to pay your contractor',
        subject: 'Action needed: add a card to your Reely contract',
        lines: [
          'A weekly invoice is ready to bill on one of your contracts, but there’s no card on file — so your contractor can’t be paid yet.',
          'Open your project in Reely and add a payment method; the invoice will charge automatically on the next run.',
        ],
        ctaHref: null,
        payload: { cycleId: c.id },
      }).catch(() => {})
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
      await notifyContractorPaid(c.contract.contractorUserId, net, c.id)
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
  const cleanReason = reason.trim().slice(0, 2000)
  await prisma.cycleDispute.create({ data: { billingCycleId, raisedByUserId: userId, reason: cleanReason } })
  await prisma.billingCycle.update({ where: { id: billingCycleId }, data: { status: 'disputed' } })
  await emit('payments', 'dispute.opened', userId, { billingCycleId }, 'contractor')
  await notifyDisputeOpened(billingCycleId, userId, cleanReason) // email the owner + notify the counterparty
  return { ok: true }
}

/** An admin resolves a cycle dispute: allow the charge (back to the window) or void the cycle. */
export async function resolveCycleDispute(disputeId: string, resolution: 'charge' | 'void', note?: string): Promise<{ ok: true } | { error: string }> {
  const d = await prisma.cycleDispute.findUnique({
    where: { id: disputeId },
    select: { billingCycleId: true, status: true, cycle: { select: { totalAmount: true, contract: { select: { clientUserId: true, contractorUserId: true } } } } },
  })
  if (!d) return { error: 'not_found' }
  if (d.status !== 'open') return { error: 'already_resolved' }
  await prisma.cycleDispute.update({ where: { id: disputeId }, data: { status: resolution === 'charge' ? 'resolved_charge' : 'resolved_void', resolutionNote: note?.trim().slice(0, 2000) || null, resolvedAt: new Date() } })
  await prisma.billingCycle.update({ where: { id: d.billingCycleId }, data: { status: resolution === 'charge' ? 'dispute_window' : 'voided' } })
  // A waiver forgoes the revenue — record it on the immutable ledger for audit (no money moves; charge case bills later).
  if (resolution === 'void') {
    await recordLedger({ kind: 'adjustment', cycleId: d.billingCycleId, clientUserId: d.cycle.contract.clientUserId, contractorUserId: d.cycle.contract.contractorUserId, gross: Number(d.cycle.totalAmount), fee: 0, net: 0, succeeded: true, description: `Dispute waived — cycle ${d.billingCycleId} not billed`, idempotencyKey: `ledger:dispute-void:${d.billingCycleId}` })
  }
  await emit('payments', 'dispute.resolved', 'system', { billingCycleId: d.billingCycleId, resolution }, 'system')
  await notifyDisputeResolved(d.billingCycleId, resolution) // tell both parties the outcome
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
  await notifyContractorPaid(charge.contractorUserId, net, charge.billingCycleId)
}

/** Money-in: tell the contractor a weekly invoice settled and a payout is on its way. Immediate email + in-app.
 *  Fired from both the stub path and the live webhook (only one runs per environment, so never double-sends). */
async function notifyContractorPaid(contractorUserId: string, net: number, cycleId: string): Promise<void> {
  const amount = net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  await notifyNow(contractorUserId, {
    type: 'payment.received',
    title: `You were paid $${amount}`,
    subject: 'You got paid on Reely',
    lines: [
      `A weekly invoice settled — $${amount} is on its way to your connected payout account.`,
      'You can see the breakdown and payout status under Payouts.',
    ],
    ctaHref: `${env.APP_BASE_URL}/contractor/payouts`,
    ctaLabel: 'View your payouts',
    payload: { cycleId, amount: net },
  }).catch(() => {})
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
