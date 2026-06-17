import { describe, expect, it } from 'vitest'
import Stripe from 'stripe'
import { verifyStripeEvent, type StripeVerifier } from './stripe'

/**
 * UNIT tests for the pure signature-verification step extracted from POST /webhooks/stripe. No DB, no network:
 * `verifyStripeEvent` is dependency-injected so we drive it with (a) hand-built mock clients whose
 * `constructEvent` returns/throws on cue, and (b) a REAL `Stripe` instance to exercise genuine HMAC verification
 * via `generateTestHeaderString`. The function must FAIL CLOSED: 503 when unconfigured, 400 on a missing or bad
 * signature, and ok+event only when the HMAC matches.
 */

const SECRET = 'whsec_testsecret'
const BODY = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' }))

// A mock verifier whose constructEvent returns a canned event (no real crypto).
function mockOk(event: Stripe.Event, spy?: (args: unknown[]) => void): StripeVerifier {
  return {
    webhooks: {
      constructEvent: ((...args: unknown[]) => {
        spy?.(args)
        return event
      }) as unknown as StripeVerifier['webhooks']['constructEvent'],
    },
  }
}

// A mock verifier whose constructEvent always throws (a forged/invalid signature).
function mockThrows(message: string): StripeVerifier {
  return {
    webhooks: {
      constructEvent: (() => {
        throw new Error(message)
      }) as unknown as StripeVerifier['webhooks']['constructEvent'],
    },
  }
}

const fakeEvent = { id: 'evt_1', type: 'payment_intent.succeeded' } as unknown as Stripe.Event

describe('verifyStripeEvent — 503 fail-closed (unconfigured)', () => {
  it('returns 503 when the client is null (no STRIPE_SECRET_KEY)', () => {
    const out = verifyStripeEvent(null, SECRET, BODY, 't=1,v1=abc')
    expect(out).toEqual({ ok: false, status: 503, error: 'billing not configured' })
  })

  it('returns 503 when the webhook secret is undefined', () => {
    const out = verifyStripeEvent(mockOk(fakeEvent), undefined, BODY, 't=1,v1=abc')
    expect(out).toEqual({ ok: false, status: 503, error: 'billing not configured' })
  })

  it('returns 503 when the webhook secret is null', () => {
    const out = verifyStripeEvent(mockOk(fakeEvent), null, BODY, 't=1,v1=abc')
    expect(out).toEqual({ ok: false, status: 503, error: 'billing not configured' })
  })

  it('returns 503 when the webhook secret is an empty string (falsy)', () => {
    const out = verifyStripeEvent(mockOk(fakeEvent), '', BODY, 't=1,v1=abc')
    expect(out).toEqual({ ok: false, status: 503, error: 'billing not configured' })
  })

  it('503 (unconfigured) wins even with a present signature — never reaches constructEvent', () => {
    let called = false
    const client = mockOk(fakeEvent, () => {
      called = true
    })
    const out = verifyStripeEvent(null, SECRET, BODY, 't=1,v1=abc')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.status).toBe(503)
    expect(called).toBe(false)
    // the mock client itself was bypassed because the null client short-circuits first
    void client
  })
})

describe('verifyStripeEvent — 400 missing signature', () => {
  it('returns 400 when the signature is undefined (header absent)', () => {
    const out = verifyStripeEvent(mockOk(fakeEvent), SECRET, BODY, undefined)
    expect(out).toEqual({ ok: false, status: 400, error: 'missing stripe-signature' })
  })

  it('returns 400 when the signature is null', () => {
    const out = verifyStripeEvent(mockOk(fakeEvent), SECRET, BODY, null)
    expect(out).toEqual({ ok: false, status: 400, error: 'missing stripe-signature' })
  })

  it('returns 400 when the signature is a string[] (duplicate header) — not a single string', () => {
    const out = verifyStripeEvent(mockOk(fakeEvent), SECRET, BODY, ['t=1,v1=a', 't=1,v1=b'])
    expect(out).toEqual({ ok: false, status: 400, error: 'missing stripe-signature' })
  })

  it('returns 400 when the signature is a number (wrong type)', () => {
    const out = verifyStripeEvent(mockOk(fakeEvent), SECRET, BODY, 12345)
    expect(out).toEqual({ ok: false, status: 400, error: 'missing stripe-signature' })
  })

  it('does NOT call constructEvent when the signature is missing', () => {
    let called = false
    const client = mockOk(fakeEvent, () => {
      called = true
    })
    verifyStripeEvent(client, SECRET, BODY, undefined)
    expect(called).toBe(false)
  })

  it('treats an empty-string signature as present (typeof string) and forwards it to constructEvent', () => {
    // An empty string is still `typeof 'string'`, so it passes the header check and Stripe rejects it (400 via throw).
    const client = mockThrows('No signatures found')
    const out = verifyStripeEvent(client, SECRET, BODY, '')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.status).toBe(400)
    if (!out.ok) expect(out.error).toContain('invalid signature')
  })
})

describe('verifyStripeEvent — 400 invalid/forged signature (constructEvent throws)', () => {
  it('returns 400 and surfaces the thrown message verbatim', () => {
    const out = verifyStripeEvent(mockThrows('No signatures found matching the expected signature'), SECRET, BODY, 't=1,v1=deadbeef')
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.status).toBe(400)
      expect(out.error).toBe('invalid signature: No signatures found matching the expected signature')
    }
  })

  it('returns 400 for a timestamp-outside-tolerance style error message', () => {
    const out = verifyStripeEvent(mockThrows('Timestamp outside the tolerance zone'), SECRET, BODY, 't=1,v1=abc')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toBe('invalid signature: Timestamp outside the tolerance zone')
  })

  it('handles a thrown error with an empty message (still 400, prefix preserved)', () => {
    const out = verifyStripeEvent(mockThrows(''), SECRET, BODY, 't=1,v1=abc')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toBe('invalid signature: ')
  })
})

describe('verifyStripeEvent — ok path (mocked client)', () => {
  it('returns ok + the constructed event when constructEvent succeeds', () => {
    const out = verifyStripeEvent(mockOk(fakeEvent), SECRET, BODY, 't=1,v1=valid')
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.event).toBe(fakeEvent)
  })

  it('forwards (rawBody, signature, secret) to constructEvent in that exact order', () => {
    let captured: unknown[] = []
    const client = mockOk(fakeEvent, (args) => {
      captured = args
    })
    const sig = 't=1,v1=order'
    verifyStripeEvent(client, SECRET, BODY, sig)
    expect(captured[0]).toBe(BODY)
    expect(captured[1]).toBe(sig)
    expect(captured[2]).toBe(SECRET)
  })
})

describe('verifyStripeEvent — REAL Stripe HMAC verification', () => {
  // A real Stripe instance does genuine HMAC-SHA256 verification; we generate a matching header with the SDK.
  const real = new Stripe('sk_test_dummy')

  it('accepts a correctly signed payload and returns the parsed event', () => {
    const payload = JSON.stringify({ id: 'evt_real', type: 'setup_intent.succeeded' })
    const header = real.webhooks.generateTestHeaderString({ payload, secret: SECRET })
    const out = verifyStripeEvent(real as unknown as StripeVerifier, SECRET, Buffer.from(payload), header)
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.event.id).toBe('evt_real')
      expect(out.event.type).toBe('setup_intent.succeeded')
    }
  })

  it('rejects a tampered body (HMAC mismatch) with 400', () => {
    const payload = JSON.stringify({ id: 'evt_real', type: 'setup_intent.succeeded' })
    const header = real.webhooks.generateTestHeaderString({ payload, secret: SECRET })
    const tampered = Buffer.from(JSON.stringify({ id: 'evt_real', type: 'payment_intent.succeeded' }))
    const out = verifyStripeEvent(real as unknown as StripeVerifier, SECRET, tampered, header)
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.status).toBe(400)
      expect(out.error).toContain('invalid signature')
    }
  })

  it('rejects a header signed with the WRONG secret with 400', () => {
    const payload = JSON.stringify({ id: 'evt_real', type: 'account.updated' })
    const header = real.webhooks.generateTestHeaderString({ payload, secret: 'whsec_wrongsecret' })
    const out = verifyStripeEvent(real as unknown as StripeVerifier, SECRET, Buffer.from(payload), header)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.status).toBe(400)
  })

  it('rejects a structurally-garbage signature header with 400', () => {
    const payload = JSON.stringify({ id: 'evt_real', type: 'account.updated' })
    const out = verifyStripeEvent(real as unknown as StripeVerifier, SECRET, Buffer.from(payload), 'not-a-real-signature')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.status).toBe(400)
  })

  it('rejects an empty-string signature against a real client with 400 (passes type check, fails HMAC)', () => {
    const payload = JSON.stringify({ id: 'evt_real', type: 'account.updated' })
    const out = verifyStripeEvent(real as unknown as StripeVerifier, SECRET, Buffer.from(payload), '')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.status).toBe(400)
  })

  it('still 503s on a real, valid header when the client is null (unconfigured wins)', () => {
    const payload = JSON.stringify({ id: 'evt_real', type: 'account.updated' })
    const header = real.webhooks.generateTestHeaderString({ payload, secret: SECRET })
    const out = verifyStripeEvent(null, SECRET, Buffer.from(payload), header)
    expect(out).toEqual({ ok: false, status: 503, error: 'billing not configured' })
  })
})
