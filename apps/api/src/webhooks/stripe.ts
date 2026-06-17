/**
 * Stripe webhook — POST /webhooks/stripe. Registered in its own encapsulated Fastify context so a buffer
 * (raw-body) content-type parser applies ONLY here (signature verification needs the exact bytes); tRPC + the
 * other routes keep normal JSON parsing. FAILS CLOSED: 503 when billing is unconfigured, 400 on a missing/bad
 * signature — a forged event never reaches the handler. The handler reconciles state only; it NEVER initiates a
 * charge (charges are platform-initiated by the worker after the dispute window).
 */
import type { FastifyInstance } from 'fastify'
import type Stripe from 'stripe'
import { env } from '../env'
import { stripe } from '../clients/stripe'
import { reconcileStripeEvent } from '../modules/payments/store'

/** The minimal Stripe surface the webhook depends on — `webhooks.constructEvent` does the HMAC verification. */
export interface StripeVerifier {
  webhooks: Pick<Stripe['webhooks'], 'constructEvent'>
}

/** Pure outcome of verifying an inbound webhook: which HTTP status the route should return + (on success) the
 *  parsed event, or (on failure) a stable error body. No I/O, no DB — exactly what the route branches on. */
export type VerifyOutcome =
  | { ok: true; event: Stripe.Event }
  | { ok: false; status: 503 | 400; error: string }

/**
 * Pure signature-verification step extracted from the route handler. Mirrors the route's fail-closed ladder:
 *  - 503 when billing is unconfigured (no Stripe client OR no webhook secret) — nothing can be trusted;
 *  - 400 when the `stripe-signature` header is missing / not a single string value;
 *  - 400 when `constructEvent` throws (bad/forged signature), surfacing the thrown message verbatim;
 *  - ok + the parsed event otherwise.
 * Dependency-injected (client + secret) so it is unit-testable with a mock or a real Stripe instance — it never
 * touches the network or the DB and never initiates a charge.
 */
export function verifyStripeEvent(
  client: StripeVerifier | null,
  webhookSecret: string | undefined | null,
  rawBody: Buffer,
  signature: unknown,
): VerifyOutcome {
  if (!client || !webhookSecret) return { ok: false, status: 503, error: 'billing not configured' }
  if (typeof signature !== 'string') return { ok: false, status: 400, error: 'missing stripe-signature' }
  try {
    const event = client.webhooks.constructEvent(rawBody, signature, webhookSecret)
    return { ok: true, event }
  } catch (e) {
    return { ok: false, status: 400, error: `invalid signature: ${(e as Error).message}` }
  }
}

export async function registerStripe(app: FastifyInstance): Promise<void> {
  await app.register(async (instance) => {
    instance.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))
    instance.post('/webhooks/stripe', async (req, reply) => {
      const verified = verifyStripeEvent(stripe(), env.STRIPE_WEBHOOK_SECRET, req.body as Buffer, req.headers['stripe-signature'])
      if (!verified.ok) return reply.code(verified.status).send({ error: verified.error })
      try {
        await reconcileStripeEvent(verified.event)
      } catch (e) {
        req.log.error(e, 'stripe event handling failed')
        return reply.code(500).send({ error: 'handler failed' }) // 5xx → Stripe retries
      }
      return reply.code(200).send({ received: true })
    })
  })
}
