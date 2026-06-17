import { describe, it, expect } from 'vitest'
import {
  sanitizeKudos,
  parseDimensions,
  overallOf,
  KUDOS_KEYS,
  DIMENSION_KEYS,
  type Dimensions,
} from './taxonomy'

describe('sanitizeKudos', () => {
  it('returns [] for non-array input', () => {
    expect(sanitizeKudos(undefined)).toEqual([])
    expect(sanitizeKudos(null)).toEqual([])
    expect(sanitizeKudos('fast')).toEqual([])
    expect(sanitizeKudos(42)).toEqual([])
    expect(sanitizeKudos({ 0: 'fast' })).toEqual([])
    expect(sanitizeKudos(true)).toEqual([])
  })

  it('returns [] for an empty array', () => {
    expect(sanitizeKudos([])).toEqual([])
  })

  it('passes through a single valid key', () => {
    expect(sanitizeKudos(['fast'])).toEqual(['fast'])
  })

  it('accepts every whitelisted key', () => {
    for (const key of KUDOS_KEYS) {
      expect(sanitizeKudos([key])).toEqual([key])
    }
  })

  it('drops keys not on the whitelist', () => {
    expect(sanitizeKudos(['not_a_key'])).toEqual([])
    expect(sanitizeKudos(['fast', 'bogus', 'reliable'])).toEqual(['fast', 'reliable'])
  })

  it('is case-sensitive (whitelist match is exact)', () => {
    expect(sanitizeKudos(['Fast', 'FAST'])).toEqual([])
  })

  it('drops non-string entries', () => {
    expect(sanitizeKudos(['fast', 1, null, undefined, {}, ['reliable'], 'reliable'])).toEqual([
      'fast',
      'reliable',
    ])
  })

  it('dedupes repeated valid keys preserving first-seen order', () => {
    expect(sanitizeKudos(['fast', 'fast', 'reliable', 'fast'])).toEqual(['fast', 'reliable'])
  })

  it('preserves input order of distinct keys', () => {
    expect(sanitizeKudos(['reliable', 'fast', 'easy'])).toEqual(['reliable', 'fast', 'easy'])
  })

  it('caps the output at MAX_KUDOS (4)', () => {
    const result = sanitizeKudos([
      'clear_comms',
      'fast',
      'above_beyond',
      'solved_hard',
      'reliable',
      'great_quality',
    ])
    expect(result).toEqual(['clear_comms', 'fast', 'above_beyond', 'solved_hard'])
    expect(result).toHaveLength(4)
  })

  it('caps at 4 even when there are more than 4 unique valid keys', () => {
    // all 8 keys are valid; only first 4 survive
    expect(sanitizeKudos([...KUDOS_KEYS])).toEqual([
      'clear_comms',
      'fast',
      'above_beyond',
      'solved_hard',
    ])
  })

  it('counts toward the cap only after dedupe (dupes do not consume slots)', () => {
    // 'fast' repeated should not fill the cap; the 4 distinct keys after it still count
    const result = sanitizeKudos([
      'fast',
      'fast',
      'fast',
      'reliable',
      'easy',
      'proactive',
      'great_quality',
    ])
    expect(result).toEqual(['fast', 'reliable', 'easy', 'proactive'])
    expect(result).toHaveLength(4)
  })

  it('does not include invalid entries toward the cap', () => {
    const result = sanitizeKudos([
      'bogus1',
      'fast',
      'bogus2',
      'reliable',
      'bogus3',
      'easy',
      'bogus4',
      'proactive',
      'above_beyond',
    ])
    expect(result).toEqual(['fast', 'reliable', 'easy', 'proactive'])
  })

  it('returns a fresh array distinct from the input', () => {
    const input = ['fast']
    const result = sanitizeKudos(input)
    expect(result).not.toBe(input)
    expect(result).toEqual(['fast'])
  })
})

describe('parseDimensions', () => {
  const fullValid = {
    communication: 5,
    quality: 4,
    timeliness: 3,
    collaboration: 2,
  }

  it('returns null for nullish / non-object input', () => {
    expect(parseDimensions(null)).toBeNull()
    expect(parseDimensions(undefined)).toBeNull()
    expect(parseDimensions(0)).toBeNull()
    expect(parseDimensions('')).toBeNull()
    expect(parseDimensions(5)).toBeNull()
    expect(parseDimensions('hello')).toBeNull()
    expect(parseDimensions(true)).toBeNull()
  })

  it('parses a fully valid map', () => {
    expect(parseDimensions(fullValid)).toEqual({
      communication: 5,
      quality: 4,
      timeliness: 3,
      collaboration: 2,
    })
  })

  it('accepts the lower boundary (all 1s)', () => {
    expect(
      parseDimensions({ communication: 1, quality: 1, timeliness: 1, collaboration: 1 }),
    ).toEqual({ communication: 1, quality: 1, timeliness: 1, collaboration: 1 })
  })

  it('accepts the upper boundary (all 5s)', () => {
    expect(
      parseDimensions({ communication: 5, quality: 5, timeliness: 5, collaboration: 5 }),
    ).toEqual({ communication: 5, quality: 5, timeliness: 5, collaboration: 5 })
  })

  it('returns null when any required key is missing', () => {
    for (const k of DIMENSION_KEYS) {
      const partial: Record<string, number> = { ...fullValid }
      delete partial[k]
      expect(parseDimensions(partial)).toBeNull()
    }
  })

  it('returns null when a key is below the minimum (0 / negative)', () => {
    expect(parseDimensions({ ...fullValid, quality: 0 })).toBeNull()
    expect(parseDimensions({ ...fullValid, quality: -1 })).toBeNull()
    expect(parseDimensions({ ...fullValid, communication: -5 })).toBeNull()
  })

  it('returns null when a key is above the maximum', () => {
    expect(parseDimensions({ ...fullValid, timeliness: 6 })).toBeNull()
    expect(parseDimensions({ ...fullValid, timeliness: 100 })).toBeNull()
  })

  it('rounds non-integer numeric values into [1,5]', () => {
    expect(
      parseDimensions({ communication: 4.4, quality: 4.5, timeliness: 1.2, collaboration: 2.6 }),
    ).toEqual({ communication: 4, quality: 5, timeliness: 1, collaboration: 3 })
  })

  it('rounds boundary-adjacent fractions correctly', () => {
    // 0.5 rounds to 1 (in-range), 5.4 rounds to 5 (in-range)
    expect(
      parseDimensions({ communication: 0.5, quality: 5.4, timeliness: 1, collaboration: 1 }),
    ).toEqual({ communication: 1, quality: 5, timeliness: 1, collaboration: 1 })
  })

  it('returns null when a rounded value falls out of range', () => {
    // 0.4 rounds to 0 (below min)
    expect(parseDimensions({ ...fullValid, quality: 0.4 })).toBeNull()
    // 5.6 rounds to 6 (above max)
    expect(parseDimensions({ ...fullValid, quality: 5.6 })).toBeNull()
  })

  it('coerces numeric strings (Number() parsing)', () => {
    expect(
      parseDimensions({ communication: '5', quality: '4', timeliness: '3', collaboration: '2' }),
    ).toEqual({ communication: 5, quality: 4, timeliness: 3, collaboration: 2 })
  })

  it('returns null for non-numeric strings (NaN)', () => {
    expect(parseDimensions({ ...fullValid, quality: 'good' })).toBeNull()
  })

  it('returns null for non-finite values', () => {
    expect(parseDimensions({ ...fullValid, quality: Infinity })).toBeNull()
    expect(parseDimensions({ ...fullValid, quality: -Infinity })).toBeNull()
    expect(parseDimensions({ ...fullValid, quality: NaN })).toBeNull()
  })

  it('returns null when a value is null/undefined (Number coercion)', () => {
    // Number(undefined) === NaN
    expect(parseDimensions({ ...fullValid, quality: undefined })).toBeNull()
    // Number(null) === 0 -> rounds to 0 -> below min -> null
    expect(parseDimensions({ ...fullValid, quality: null })).toBeNull()
  })

  it('ignores extra unknown keys', () => {
    expect(parseDimensions({ ...fullValid, extra: 99, sneaky: 'x' })).toEqual({
      communication: 5,
      quality: 4,
      timeliness: 3,
      collaboration: 2,
    })
  })

  it('returns only the four canonical keys (no extras leak through)', () => {
    const result = parseDimensions({ ...fullValid, extra: 3 })
    expect(result).not.toBeNull()
    expect(Object.keys(result as Dimensions).sort()).toEqual([...DIMENSION_KEYS].sort())
  })
})

describe('overallOf', () => {
  it('averages four equal values to that value', () => {
    expect(
      overallOf({ communication: 5, quality: 5, timeliness: 5, collaboration: 5 }),
    ).toBe(5)
    expect(
      overallOf({ communication: 1, quality: 1, timeliness: 1, collaboration: 1 }),
    ).toBe(1)
    expect(
      overallOf({ communication: 3, quality: 3, timeliness: 3, collaboration: 3 }),
    ).toBe(3)
  })

  it('rounds a fractional mean down (mean 2.5 -> 3, banker not used)', () => {
    // sum 10 / 4 = 2.5 -> Math.round = 3
    expect(
      overallOf({ communication: 1, quality: 2, timeliness: 3, collaboration: 4 }),
    ).toBe(3)
  })

  it('rounds a mean below .5 down', () => {
    // sum 9 / 4 = 2.25 -> 2
    expect(
      overallOf({ communication: 1, quality: 2, timeliness: 3, collaboration: 3 }),
    ).toBe(2)
  })

  it('rounds a mean above .5 up', () => {
    // sum 11 / 4 = 2.75 -> 3
    expect(
      overallOf({ communication: 2, quality: 2, timeliness: 3, collaboration: 4 }),
    ).toBe(3)
  })

  it('handles a high-leaning mixed set', () => {
    // sum 18 / 4 = 4.5 -> 5
    expect(
      overallOf({ communication: 5, quality: 5, timeliness: 4, collaboration: 4 }),
    ).toBe(5)
  })

  it('produces a result within 1..5 for the boundary inputs', () => {
    const lo = overallOf({ communication: 1, quality: 1, timeliness: 1, collaboration: 1 })
    const hi = overallOf({ communication: 5, quality: 5, timeliness: 5, collaboration: 5 })
    expect(lo).toBeGreaterThanOrEqual(1)
    expect(hi).toBeLessThanOrEqual(5)
  })

  it('agrees with parseDimensions output end-to-end', () => {
    const d = parseDimensions({ communication: 4, quality: 5, timeliness: 4, collaboration: 5 })
    expect(d).not.toBeNull()
    // sum 18 / 4 = 4.5 -> 5
    expect(overallOf(d as Dimensions)).toBe(5)
  })
})
