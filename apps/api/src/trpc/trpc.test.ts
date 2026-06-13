import { describe, it, expect } from 'vitest'
import { resolveApiContext, actorFor } from './trpc'

// Pure auth-mapping unit tests (no DB). resolveApiContext is the trust boundary: it turns inbound headers
// (presented by the trusted web server) into the role + service-caller flags the procedures gate on, and
// actorFor maps that to the @contractor/db RLS actor. A wrong mapping here = a privilege bug, so pin it.
const ENV = { CONTRACTOR_SERVICE_KEY: 'svc-test-key' }

describe('resolveApiContext — role mapping', () => {
  it("maps Clerk's portfolio 'admin' role to platform_admin", () => {
    const ctx = resolveApiContext({ 'x-acting-user': 'u1', 'x-acting-role': 'admin' }, ENV)
    expect(ctx.role).toBe('platform_admin')
    expect(ctx.clerkUserId).toBe('u1')
  })
  it('maps platform_admin verbatim', () => {
    expect(resolveApiContext({ 'x-acting-role': 'platform_admin' }, ENV).role).toBe('platform_admin')
  })
  it('maps contractor', () => {
    expect(resolveApiContext({ 'x-acting-role': 'contractor' }, ENV).role).toBe('contractor')
  })
  it('defaults any other/absent role to applicant (least privilege)', () => {
    expect(resolveApiContext({}, ENV).role).toBe('applicant')
    expect(resolveApiContext({ 'x-acting-role': 'member' }, ENV).role).toBe('applicant')
  })
  it('ignores empty-string headers', () => {
    expect(resolveApiContext({ 'x-acting-user': '' }, ENV).clerkUserId).toBeUndefined()
  })
})

describe('resolveApiContext — service-key gate', () => {
  it('serviceCaller is true only when the key matches exactly', () => {
    expect(resolveApiContext({ 'x-contractor-service-key': 'svc-test-key' }, ENV).serviceCaller).toBe(true)
    expect(resolveApiContext({ 'x-contractor-service-key': 'wrong' }, ENV).serviceCaller).toBe(false)
    expect(resolveApiContext({}, ENV).serviceCaller).toBe(false)
  })
  it('fails closed when the env key is unset (an empty key never authenticates)', () => {
    expect(resolveApiContext({ 'x-contractor-service-key': '' }, { CONTRACTOR_SERVICE_KEY: '' }).serviceCaller).toBe(false)
  })
})

describe('actorFor — DB RLS actor', () => {
  it('no acting user → system actor', () => {
    expect(actorFor({ role: 'applicant', serviceCaller: true })).toEqual({ kind: 'system' })
  })
  it('maps each role to its DB actor kind', () => {
    expect(actorFor({ clerkUserId: 'u1', role: 'platform_admin', serviceCaller: true })).toEqual({ kind: 'platform_admin', clerkUserId: 'u1' })
    expect(actorFor({ clerkUserId: 'u2', role: 'contractor', serviceCaller: true })).toEqual({ kind: 'contractor', clerkUserId: 'u2' })
    expect(actorFor({ clerkUserId: 'u3', role: 'applicant', serviceCaller: true })).toEqual({ kind: 'applicant', clerkUserId: 'u3' })
  })
})
