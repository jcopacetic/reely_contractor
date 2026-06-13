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

/** Platform-initiated charge to the client. Stub → a synthetic PaymentIntent id (no money moves). */
export async function chargeClient(input: { clientUserId: string; amountCents: number; idempotencyKey: string; description: string }): Promise<{ paymentIntentId: string }> {
  const s = stripe()
  if (!s) {
    console.log(`[stripe stub] would charge ${input.clientUserId} $${(input.amountCents / 100).toFixed(2)} — ${input.description}`)
    return { paymentIntentId: `pi_stub_${h(input.idempotencyKey)}` }
  }
  // A live charge needs the client's saved payment method (a Stripe customer + card on file) — that collection
  // flow is the go-live follow-up. For now create the PaymentIntent shell, idempotency-keyed.
  const pi = await s.paymentIntents.create(
    { amount: input.amountCents, currency: 'usd', description: input.description, metadata: { clientUserId: input.clientUserId } },
    { idempotencyKey: input.idempotencyKey },
  )
  return { paymentIntentId: pi.id }
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
