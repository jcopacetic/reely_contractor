import { describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import { registerStripe } from './stripe'

/**
 * The webhook must FAIL CLOSED. With Stripe unconfigured (no secret key in the unit env) every POST is rejected
 * 503 — a forged event can never reach the reconciler. (The 400-bad-signature path needs live keys; it is
 * exercised against the engine in the e2e suite. The invariant proven here: no path returns 200 to an
 * unauthenticated caller.)
 */
describe('stripe webhook — fails closed', () => {
  it('returns 503 when billing is unconfigured (no signature can be trusted)', async () => {
    const app = Fastify()
    await registerStripe(app)
    const res = await app.inject({ method: 'POST', url: '/webhooks/stripe', headers: { 'content-type': 'application/json' }, payload: Buffer.from('{"id":"evt_forged","type":"payment_intent.succeeded"}') })
    expect(res.statusCode).toBe(503)
    expect(res.statusCode).not.toBe(200)
    await app.close()
  })

  it('still 503s even with a (forged) stripe-signature header present', async () => {
    const app = Fastify()
    await registerStripe(app)
    const res = await app.inject({ method: 'POST', url: '/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' }, payload: Buffer.from('{}') })
    expect(res.statusCode).toBe(503)
    await app.close()
  })
})
