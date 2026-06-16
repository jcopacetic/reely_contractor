/**
 * Stripe Connect (Express) client — payouts to contractors + platform-initiated charges to clients. STUBS
 * (synthetic ids, logs "would …") when STRIPE_SECRET_KEY is unset, so the weekly billing cycle runs end-to-end
 * locally + in prod without real money, and goes live on config with no code change. The DB (billing_cycle /
 * charge / payout) is authoritative either way. Charges are platform-initiated AFTER the dispute window — never
 * by the webhook. No card data is ever stored here.
 */
import Stripe from 'stripe'
import { env } from '../env'

let singleton: Stripe | null | undefined
export function stripe(): Stripe | null {
  if (singleton === undefined) singleton = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null
  return singleton
}
export const stripeConfigured = (): boolean => stripe() !== null

// tiny non-crypto hash so stub ids are stable per input (Math.random is avoided in this codebase)
const h = (s: string): string => {
  let n = 0
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) | 0
  return Math.abs(n).toString(36)
}

/** Create a contractor's Connect Express account. Stub → a synthetic acct id. */
export async function createConnectAccount(contractorUserId: string, email?: string): Promise<{ accountId: string }> {
  const s = stripe()
  if (!s) return { accountId: `acct_stub_${h(contractorUserId)}` }
  const acct = await s.accounts.create({ type: 'express', metadata: { contractorUserId }, ...(email ? { email } : {}) })
  return { accountId: acct.id }
}

/** An onboarding (account-link) URL for the contractor to complete KYC. Stub → a placeholder URL. */
export async function onboardingLink(accountId: string): Promise<string> {
  const s = stripe()
  const back = `${env.APP_BASE_URL}/contractor/payouts`
  if (!s) return `${back}?stub=1`
  const link = await s.accountLinks.create({ account: accountId, type: 'account_onboarding', refresh_url: back, return_url: back })
  return link.url
}

/** A Connect account's KYC/capability status. Stub → not-yet-enabled. */
export async function accountStatus(accountId: string): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean; kyc: 'pending' | 'verified' | 'restricted' }> {
  const s = stripe()
  if (!s) return { chargesEnabled: false, payoutsEnabled: false, kyc: 'pending' }
  const a = await s.accounts.retrieve(accountId)
  const kyc = a.payouts_enabled ? 'verified' : a.requirements?.disabled_reason ? 'restricted' : 'pending'
  return { chargesEnabled: Boolean(a.charges_enabled), payoutsEnabled: Boolean(a.payouts_enabled), kyc }
}

// ── client card-on-file (a Stripe customer + a SetupIntent-saved card, so cycle charges have a method) ──
/** Create a Stripe customer for a client. Stub → a synthetic customer id. No card data is stored by us. */
export async function createCustomer(clientUserId: string, email?: string): Promise<{ customerId: string }> {
  const s = stripe()
  if (!s) return { customerId: `cus_stub_${h(clientUserId)}` }
  const c = await s.customers.create({ metadata: { clientUserId }, ...(email ? { email } : {}) })
  return { customerId: c.id }
}

/** A SetupIntent to collect + save a card off-session for future cycle charges. Stub → a synthetic secret. */
export async function createSetupIntent(customerId: string): Promise<{ clientSecret: string; setupIntentId: string }> {
  const s = stripe()
  if (!s) return { clientSecret: `seti_stub_${h(customerId)}_secret`, setupIntentId: `seti_stub_${h(customerId)}` }
  const si = await s.setupIntents.create({ customer: customerId, usage: 'off_session', payment_method_types: ['card'] })
  return { clientSecret: si.client_secret ?? '', setupIntentId: si.id }
}

/** Set a payment method as the customer's default + read its brand/last4 for display. Stub → a test card. */
export async function attachDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<{ brand: string | null; last4: string | null }> {
  const s = stripe()
  if (!s) return { brand: 'visa', last4: '4242' }
  await s.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } })
  const pm = await s.paymentMethods.retrieve(paymentMethodId)
  return { brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null }
}

/** A hosted Stripe Checkout session (SETUP mode) to collect + save a card — no frontend Stripe deps needed,
 *  the card is entered on Stripe's page. On completion Stripe fires `setup_intent.succeeded` (handled by the
 *  webhook → saved as the customer's default). Stub → the return URL with a marker. */
export async function createSetupCheckout(customerId: string, returnUrl: string): Promise<{ url: string }> {
  const sep = returnUrl.includes('?') ? '&' : '?'
  const s = stripe()
  if (!s) return { url: `${returnUrl}${sep}card=stub` }
  const session = await s.checkout.sessions.create({
    mode: 'setup',
    customer: customerId,
    payment_method_types: ['card'],
    success_url: `${returnUrl}${sep}card=added`,
    cancel_url: `${returnUrl}${sep}card=cancelled`,
  })
  return { url: session.url ?? returnUrl }
}

/**
 * Platform-initiated charge to the client, off-session against their saved card. Stub → a synthetic
 * PaymentIntent id (no money moves). Returns a status the cycle engine acts on:
 *  - no_payment_method → no card on file; the cycle stays unbilled (retries once a card is added)
 *  - pending           → live charge created (the webhook flips it to succeeded + opens the payout)
 *  - failed            → the saved card declined / needs action (ops follow-up; not auto-retried)
 */
export async function chargeClient(input: {
  clientUserId: string
  customerId: string | null
  paymentMethodId: string | null
  amountCents: number
  idempotencyKey: string
  description: string
}): Promise<{ paymentIntentId: string | null; status: 'pending' | 'succeeded' | 'no_payment_method' | 'failed' }> {
  const s = stripe()
  if (!s) {
    console.log(`[stripe stub] would charge ${input.clientUserId} $${(input.amountCents / 100).toFixed(2)} — ${input.description}`)
    return { paymentIntentId: `pi_stub_${h(input.idempotencyKey)}`, status: 'succeeded' }
  }
  if (!input.customerId || !input.paymentMethodId) return { paymentIntentId: null, status: 'no_payment_method' }
  try {
    const pi = await s.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: 'usd',
        description: input.description,
        customer: input.customerId,
        payment_method: input.paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: { clientUserId: input.clientUserId },
      },
      { idempotencyKey: input.idempotencyKey },
    )
    // The webhook (payment_intent.succeeded) is the single settlement path, even when confirm returns succeeded.
    return { paymentIntentId: pi.id, status: 'pending' }
  } catch (e) {
    const pi = (e as Stripe.errors.StripeError).payment_intent
    return { paymentIntentId: pi?.id ?? null, status: 'failed' }
  }
}

/** Transfer the net to the contractor's connected account. Stub → a synthetic transfer id. */
export async function transferToContractor(input: { accountId: string; amountCents: number; idempotencyKey: string }): Promise<{ transferId: string }> {
  const s = stripe()
  if (!s) {
    console.log(`[stripe stub] would transfer $${(input.amountCents / 100).toFixed(2)} to ${input.accountId}`)
    return { transferId: `tr_stub_${h(input.idempotencyKey)}` }
  }
  const tr = await s.transfers.create({ amount: input.amountCents, currency: 'usd', destination: input.accountId }, { idempotencyKey: `${input.idempotencyKey}:tr` })
  return { transferId: tr.id }
}
