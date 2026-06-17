import { describe, it, expect } from 'vitest'
import { categoryForCeremony, channelEnabled, asCategoryPrefs, NOTIFY_CATEGORIES } from './prefs'

// Pure preference logic (NO DB): ceremony→category mapping, channel gating with restraint defaults +
// the transactional in-app lock, and defensive JSON coercion.

describe('categoryForCeremony', () => {
  it('maps the ceremony tags to user-facing categories', () => {
    for (const c of ['standup', 'sprint', 'blocker', 'change_request', 'charter']) expect(categoryForCeremony(c)).toBe('work')
    expect(categoryForCeremony('hire')).toBe('hire')
    expect(categoryForCeremony('account')).toBe('billing')
    expect(categoryForCeremony('billing')).toBe('billing')
  })
  it('falls back to work for anything unknown', () => {
    expect(categoryForCeremony('mystery')).toBe('work')
    expect(categoryForCeremony('')).toBe('work')
  })
})

describe('channelEnabled — default ON', () => {
  it('absent prefs → every channel on', () => {
    expect(channelEnabled({}, 'work', 'inApp')).toBe(true)
    expect(channelEnabled({}, 'work', 'email')).toBe(true)
    expect(channelEnabled({}, 'hire', 'email')).toBe(true)
  })
  it('an explicit false mutes that one channel', () => {
    expect(channelEnabled({ work: { email: false } }, 'work', 'email')).toBe(false)
    expect(channelEnabled({ work: { email: false } }, 'work', 'inApp')).toBe(true) // other channel unaffected
  })
  it('an explicit true is on', () => {
    expect(channelEnabled({ hire: { inApp: true } }, 'hire', 'inApp')).toBe(true)
  })
})

describe('channelEnabled — transactional in-app lock', () => {
  it('billing in-app can NOT be muted (transactional), even if the pref says false', () => {
    expect(channelEnabled({ billing: { inApp: false } }, 'billing', 'inApp')).toBe(true)
  })
  it('billing email CAN still be muted', () => {
    expect(channelEnabled({ billing: { email: false } }, 'billing', 'email')).toBe(false)
  })
  it('the locked set matches the category table', () => {
    expect(NOTIFY_CATEGORIES.find((c) => c.key === 'billing')?.inAppLocked).toBe(true)
    expect(NOTIFY_CATEGORIES.find((c) => c.key === 'work')?.inAppLocked).toBe(false)
  })
})

describe('asCategoryPrefs — defensive coercion', () => {
  it('non-objects → empty', () => {
    expect(asCategoryPrefs(null)).toEqual({})
    expect(asCategoryPrefs('nope')).toEqual({})
    expect(asCategoryPrefs(42)).toEqual({})
  })
  it('keeps only boolean inApp/email entries', () => {
    expect(asCategoryPrefs({ work: { email: false, inApp: true, junk: 'x' }, bad: 5, hire: { email: 'no' } })).toEqual({ work: { inApp: true, email: false }, hire: {} })
  })
})
