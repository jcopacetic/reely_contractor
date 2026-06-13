/**
 * Stripe webhook — POST /webhooks/stripe. Registered in its own encapsulated Fastify context so a buffer
 * (raw-body) content-type parser applies ONLY here (signature verification needs the exact bytes); tRPC + the
 * other routes keep normal JSON parsing. FAILS CLOSED: 503 when billing is unconfigured, 400 on a missing/bad
 * signature — a forged event never reaches the handler. The handler reconciles state only; it NEVER initiates a
 * charge (charges are platform-initiated by the worker after the dispute window).
 */
import type { FastifyInstance } from 'fastify'
import { env } from '../env'
import { stripe } from '../clients/stripe'
import { reconcileStripeEvent } from '../modules/payments/store'

export async function registerStripe(app: FastifyInstance): Promise<void> {
  await app.register(async (instance) => {
    instance.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))
    instance.post('/webhooks/stripe', async (req, reply) => {
      const s = stripe()
      if (!s || !env.STRIPE_WEBHOOK_SECRET) return reply.code(503).send({ error: 'billing not configured' })
      const sig = req.headers['stripe-signature']
      if (typeof sig !== 'string') return reply.code(400).send({ error: 'missing stripe-signature' })
      let event
      try {
        event = s.webhooks.constructEvent(req.body as Buffer, sig, env.STRIPE_WEBHOOK_SECRET)
      } catch (e) {
        return reply.code(400).send({ error: `invalid signature: ${(e as Error).message}` })
      }
      try {
        await reconcileStripeEvent(event)
      } catch (e) {
        req.log.error(e, 'stripe event handling failed')
        return reply.code(500).send({ error: 'handler failed' }) // 5xx → Stripe retries
      }
      return reply.code(200).send({ received: true })
    })
  })
}
