import { describe, it, expect } from 'vitest'
import { validateHireRequest } from './store'

// Pure validation/normalization of an inbound hire request (NO DB). Importing the module is safe (prisma lazy).

const base = { fromName: 'Jane Buyer', fromEmail: 'jane@acme.com', message: 'We need a HubSpot migration.' }

describe('validateHireRequest', () => {
  it('accepts and normalizes a valid request', () => {
    const r = validateHireRequest({ ...base, fromEmail: '  Jane@Acme.com ', projectType: '  Migration  ', budget: ' $5k ' })
    expect('value' in r).toBe(true)
    if ('value' in r) {
      expect(r.value.fromEmail).toBe('jane@acme.com') // trimmed + lowercased
      expect(r.value.fromName).toBe('Jane Buyer')
      expect(r.value.projectType).toBe('Migration')
      expect(r.value.budget).toBe('$5k')
    }
  })

  it('empty optionals normalize to null', () => {
    const r = validateHireRequest({ ...base, projectType: '   ', budget: '' })
    if ('value' in r) {
      expect(r.value.projectType).toBeNull()
      expect(r.value.budget).toBeNull()
    } else throw new Error('expected value')
  })

  it('rejects an empty or over-long name', () => {
    expect(validateHireRequest({ ...base, fromName: '   ' })).toEqual({ error: 'invalid_name' })
    expect(validateHireRequest({ ...base, fromName: 'a'.repeat(81) })).toEqual({ error: 'invalid_name' })
  })

  it('accepts a name at the 80-char boundary', () => {
    expect('value' in validateHireRequest({ ...base, fromName: 'a'.repeat(80) })).toBe(true)
  })

  it('rejects malformed emails', () => {
    for (const e of ['', 'jane', 'jane@', '@acme.com', 'jane acme.com', 'jane@acme']) {
      expect(validateHireRequest({ ...base, fromEmail: e })).toEqual({ error: 'invalid_email' })
    }
  })

  it('rejects an empty or over-long message', () => {
    expect(validateHireRequest({ ...base, message: '   ' })).toEqual({ error: 'invalid_message' })
    expect(validateHireRequest({ ...base, message: 'a'.repeat(2001) })).toEqual({ error: 'invalid_message' })
  })

  it('clamps over-long optional fields to 120 chars', () => {
    const r = validateHireRequest({ ...base, projectType: 'x'.repeat(200), budget: 'y'.repeat(200) })
    if ('value' in r) {
      expect(r.value.projectType).toHaveLength(120)
      expect(r.value.budget).toHaveLength(120)
    } else throw new Error('expected value')
  })
})
