import { describe, it, expect } from 'vitest'
import { usd } from './disputes'

/**
 * Unit tests for usd(n) — the pure USD currency formatter.
 * usd(n) => `$` + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
 * No DB / network is touched (importing the module instantiates prisma lazily).
 */
describe('usd', () => {
  describe('happy paths', () => {
    it('formats a whole-dollar amount with two fraction digits', () => {
      expect(usd(5)).toBe('$5.00')
    })

    it('formats a simple cents amount', () => {
      expect(usd(5.5)).toBe('$5.50')
    })

    it('formats an amount with two existing decimals', () => {
      expect(usd(12.34)).toBe('$12.34')
    })

    it('inserts a thousands separator', () => {
      expect(usd(1000)).toBe('$1,000.00')
    })

    it('inserts thousands separators for large amounts', () => {
      expect(usd(1234567.89)).toBe('$1,234,567.89')
    })

    it('separates at the four-digit boundary', () => {
      expect(usd(9999.99)).toBe('$9,999.99')
    })

    it('does not separate a three-digit amount', () => {
      expect(usd(999)).toBe('$999.00')
    })
  })

  describe('zero and small values', () => {
    it('formats zero', () => {
      expect(usd(0)).toBe('$0.00')
    })

    it('formats a sub-dollar value', () => {
      expect(usd(0.01)).toBe('$0.01')
    })

    it('formats a value just under one dollar', () => {
      expect(usd(0.99)).toBe('$0.99')
    })
  })

  describe('negative values', () => {
    it('places the minus sign before the dollar glyph', () => {
      // toLocaleString prefixes the negative sign, so it lands between `$` and the digits.
      expect(usd(-5)).toBe('$-5.00')
    })

    it('formats a negative value with thousands separators', () => {
      expect(usd(-1234.5)).toBe('$-1,234.50')
    })

    it('formats negative zero as zero', () => {
      // -0 toLocaleStrings to "-0.00" in en-US.
      expect(usd(-0)).toBe('$-0.00')
    })
  })

  describe('rounding (maximumFractionDigits: 2)', () => {
    it('rounds a third decimal up (round-half-up boundary)', () => {
      expect(usd(1.005)).toBe('$1.01')
    })

    it('rounds a third decimal of 5 up', () => {
      expect(usd(0.125)).toBe('$0.13')
    })

    it('rounds down when the third decimal is below 5', () => {
      expect(usd(2.344)).toBe('$2.34')
    })

    it('rounds up when the third decimal is above 5', () => {
      expect(usd(2.346)).toBe('$2.35')
    })

    it('rounds a long fractional tail to two places', () => {
      expect(usd(3.14159)).toBe('$3.14')
    })

    it('rounds up across the dollar boundary', () => {
      expect(usd(9.999)).toBe('$10.00')
    })
  })

  describe('boundaries and large magnitudes', () => {
    it('formats exactly one million', () => {
      expect(usd(1000000)).toBe('$1,000,000.00')
    })

    it('formats a very large amount with multiple separators', () => {
      expect(usd(12345678.9)).toBe('$12,345,678.90')
    })

    it('starts a thousands group only at 1000', () => {
      expect(usd(1000.01)).toBe('$1,000.01')
    })
  })

  describe('non-finite / invalid input', () => {
    it('formats NaN as the literal NaN (toLocaleString of NaN)', () => {
      expect(usd(NaN)).toBe('$NaN')
    })

    it('formats positive Infinity', () => {
      expect(usd(Infinity)).toBe('$∞')
    })

    it('formats negative Infinity', () => {
      expect(usd(-Infinity)).toBe('$-∞')
    })
  })

  describe('shape invariants', () => {
    it('always starts with a dollar sign', () => {
      for (const n of [0, 1, 1000, -42, 1234.56]) {
        expect(usd(n).startsWith('$')).toBe(true)
      }
    })

    it('always renders exactly two fraction digits for finite values', () => {
      for (const n of [0, 1, 5.5, 1234.567, -8]) {
        const out = usd(n)
        expect(out).toMatch(/\.\d{2}$/)
      }
    })
  })
})
