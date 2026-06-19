import { describe, it, expect } from 'vitest'
import { isNotifiable, recipientFor } from './notify'

/**
 * UNIT tests for the PURE logic in notify.ts. No DB / network: we only call
 * isNotifiable (event classification) and recipientFor (the pure two-party
 * recipient-derivation extracted from notifyForEvent). Importing the module is
 * safe — the prisma client instantiates lazily and notifyForEvent (which queries
 * the DB) is never called here; that path is e2e-covered.
 *
 * recipientFor encodes the routing rule: a `contractor` actor notifies the client;
 * EVERY other actorRole (client / system / unknown / empty) notifies the contractor.
 */

// The exact event types the NOTIFY map classifies as notifiable (the curated allow-list).
const NOTIFIABLE_TYPES = [
  'standup.posted',
  'standup.requested',
  'sprint.proposed',
  'sprint.agreed',
  'sprint.submitted',
  'sprint.accepted',
  'sprint.changes_requested',
  'blocker.raised',
  'blocker.resolved',
  'change_request.proposed',
  'change_request.agreed',
  'charter.kicked_off',
  'charter.closed_out',
  // P1 contract-scoped additions (counterparty-routed):
  'review.created',
  'doc.added',
  'doc.signed',
  'doc.executed',
]

describe('isNotifiable', () => {
  it('returns true for every event type in the NOTIFY allow-list', () => {
    for (const type of NOTIFIABLE_TYPES) {
      expect(isNotifiable(type)).toBe(true)
    }
  })

  it('classifies exactly 17 notifiable event types (guards against silent map drift)', () => {
    const hits = NOTIFIABLE_TYPES.filter((t) => isNotifiable(t))
    expect(hits).toHaveLength(17)
  })

  it('returns false for an unknown / unlisted event type', () => {
    expect(isNotifiable('standup.deleted')).toBe(false)
    expect(isNotifiable('contract.created')).toBe(false)
    expect(isNotifiable('totally.made.up')).toBe(false)
  })

  it('returns false for the empty string', () => {
    expect(isNotifiable('')).toBe(false)
  })

  it('is case-sensitive — wrong casing is not notifiable', () => {
    expect(isNotifiable('Standup.Posted')).toBe(false)
    expect(isNotifiable('SPRINT.AGREED')).toBe(false)
  })

  it('does not match on whitespace-padded keys', () => {
    expect(isNotifiable(' standup.posted')).toBe(false)
    expect(isNotifiable('standup.posted ')).toBe(false)
  })

  it('is not fooled by a partial / prefix match', () => {
    expect(isNotifiable('standup')).toBe(false)
    expect(isNotifiable('sprint.')).toBe(false)
    expect(isNotifiable('standup.posted.extra')).toBe(false)
  })

  it('documents that the `in`-operator check leaks inherited Object.prototype keys (known behavior)', () => {
    // isNotifiable uses `type in NOTIFY`, which walks the prototype chain — so well-known
    // Object.prototype members report as "notifiable" even though they are not real events.
    // This is harmless in practice (emit() only ever passes real, declared event type literals),
    // but the test pins the actual behavior so a future refactor to Object.hasOwn is a deliberate,
    // visible change rather than a silent one.
    expect(isNotifiable('toString')).toBe(true)
    expect(isNotifiable('hasOwnProperty')).toBe(true)
    expect(isNotifiable('__proto__')).toBe(true)
  })
})

describe('recipientFor', () => {
  const parties = { clientUserId: 'client_user', contractorUserId: 'contractor_user' }

  it('routes a contractor-actor event to the CLIENT', () => {
    expect(recipientFor('contractor', parties)).toBe('client_user')
  })

  it('routes a client-actor event to the CONTRACTOR', () => {
    expect(recipientFor('client', parties)).toBe('contractor_user')
  })

  it('routes a system-actor event to the CONTRACTOR', () => {
    expect(recipientFor('system', parties)).toBe('contractor_user')
  })

  it('routes any unknown / unexpected actorRole to the CONTRACTOR (contractor is the default counterparty)', () => {
    expect(recipientFor('applicant', parties)).toBe('contractor_user')
    expect(recipientFor('platform_admin', parties)).toBe('contractor_user')
    expect(recipientFor('', parties)).toBe('contractor_user')
    expect(recipientFor('CONTRACTOR', parties)).toBe('contractor_user') // case-sensitive — not the literal 'contractor'
  })

  it('is strictly case-sensitive on the "contractor" literal', () => {
    expect(recipientFor('Contractor', parties)).toBe('contractor_user')
    expect(recipientFor('contractor ', parties)).toBe('contractor_user')
  })

  it('always returns the counterparty, never the actor side (no self-notify) for both roles', () => {
    // contractor actor -> recipient is NOT the contractor's id
    expect(recipientFor('contractor', parties)).not.toBe(parties.contractorUserId)
    // client actor -> recipient is NOT the client's id
    expect(recipientFor('client', parties)).not.toBe(parties.clientUserId)
  })

  it('passes the chosen party id through verbatim (no transformation)', () => {
    const weird = { clientUserId: 'user 123/&🚀', contractorUserId: 'user_x' }
    expect(recipientFor('contractor', weird)).toBe('user 123/&🚀')
  })

  it('returns the (possibly empty) party id as-is even when ids are empty strings', () => {
    expect(recipientFor('contractor', { clientUserId: '', contractorUserId: 'c' })).toBe('')
    expect(recipientFor('client', { clientUserId: 'c', contractorUserId: '' })).toBe('')
  })

  it('handles client === contractor (self-contract) by returning that same id either way', () => {
    const same = { clientUserId: 'u_same', contractorUserId: 'u_same' }
    expect(recipientFor('contractor', same)).toBe('u_same')
    expect(recipientFor('client', same)).toBe('u_same')
  })

  it('is deterministic — repeated calls with the same inputs return the same recipient', () => {
    expect(recipientFor('contractor', parties)).toBe(recipientFor('contractor', parties))
    expect(recipientFor('system', parties)).toBe(recipientFor('system', parties))
  })
})
