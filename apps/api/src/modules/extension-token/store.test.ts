/**
 * Unit tests for the pure crypto/normalization core of the extension-token store (`mintToken`).
 * DB-free: never calls `mint`/`list`/`revoke` (those hit prisma). We exercise only `mintToken`,
 * which generates an `ext_*` token, its sha256 hex hash, and the normalized label.
 *
 * Determinism: where we assert exact bytes we mock `node:crypto.randomBytes` with a fixed buffer.
 * The unmocked block asserts only on stable structural invariants (prefix, length, charset, hash
 * consistency) — never on the random payload itself.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHash } from 'node:crypto'

// We import the module fresh inside each test that needs a mock so the vi.mock takes effect.
async function loadStore() {
  return await import('./store')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.unmock('node:crypto')
  vi.doUnmock('node:crypto')
})

describe('mintToken — token + sha256 (real crypto, structural invariants)', () => {
  it('prefixes the token with "ext_"', async () => {
    const { mintToken } = await loadStore()
    expect(mintToken().token.startsWith('ext_')).toBe(true)
  })

  it('produces a 36-char token: "ext_" (4) + 32 base64url chars from 24 random bytes', async () => {
    const { mintToken } = await loadStore()
    const { token } = mintToken()
    // 24 bytes → ceil(24*8/6)=32 base64url chars, no padding.
    expect(token.length).toBe(36)
    const body = token.slice(4)
    expect(body.length).toBe(32)
  })

  it('uses only base64url charset (no +, /, or = padding) in the token body', async () => {
    const { mintToken } = await loadStore()
    const body = mintToken().token.slice(4)
    expect(body).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(body).not.toContain('+')
    expect(body).not.toContain('/')
    expect(body).not.toContain('=')
  })

  it('hashes with sha256 → 64 lowercase hex chars', async () => {
    const { mintToken } = await loadStore()
    const { tokenHash } = mintToken()
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('tokenHash equals sha256(token) — hash is of the plaintext token, not its body', async () => {
    const { mintToken } = await loadStore()
    const { token, tokenHash } = mintToken()
    const expected = createHash('sha256').update(token).digest('hex')
    expect(tokenHash).toBe(expected)
    // Guard: it is NOT the hash of just the body or of a different string.
    expect(tokenHash).not.toBe(createHash('sha256').update(token.slice(4)).digest('hex'))
  })

  it('generates a distinct token + hash on each call (randomness wired in)', async () => {
    const { mintToken } = await loadStore()
    const a = mintToken()
    const b = mintToken()
    expect(a.token).not.toBe(b.token)
    expect(a.tokenHash).not.toBe(b.tokenHash)
  })
})

describe('mintToken — label normalization', () => {
  it('returns null when no label is provided (undefined)', async () => {
    const { mintToken } = await loadStore()
    expect(mintToken().label).toBeNull()
    expect(mintToken(undefined).label).toBeNull()
  })

  it('returns null when label is explicitly null', async () => {
    const { mintToken } = await loadStore()
    expect(mintToken(null).label).toBeNull()
  })

  it('returns null for an empty string', async () => {
    const { mintToken } = await loadStore()
    expect(mintToken('').label).toBeNull()
  })

  it('returns null for a whitespace-only string (trim → empty → null)', async () => {
    const { mintToken } = await loadStore()
    expect(mintToken('   ').label).toBeNull()
    expect(mintToken('\t\n  ').label).toBeNull()
  })

  it('trims surrounding whitespace from a label', async () => {
    const { mintToken } = await loadStore()
    expect(mintToken('  My Laptop  ').label).toBe('My Laptop')
  })

  it('keeps a normal label unchanged', async () => {
    const { mintToken } = await loadStore()
    expect(mintToken('Work MacBook').label).toBe('Work MacBook')
  })

  it('caps the label at 80 chars (boundary: exactly 80 is kept whole)', async () => {
    const { mintToken } = await loadStore()
    const exactly80 = 'a'.repeat(80)
    expect(mintToken(exactly80).label).toBe(exactly80)
    expect(mintToken(exactly80).label!.length).toBe(80)
  })

  it('truncates an 81-char label down to 80 chars', async () => {
    const { mintToken } = await loadStore()
    const tooLong = 'b'.repeat(81)
    const out = mintToken(tooLong).label
    expect(out!.length).toBe(80)
    expect(out).toBe('b'.repeat(80))
  })

  it('trims BEFORE slicing — leading whitespace does not consume the 80-char budget', async () => {
    const { mintToken } = await loadStore()
    const padded = '   ' + 'c'.repeat(80) + '   '
    const out = mintToken(padded).label
    expect(out).toBe('c'.repeat(80))
    expect(out!.length).toBe(80)
  })

  it('preserves interior whitespace and unicode within the cap', async () => {
    const { mintToken } = await loadStore()
    expect(mintToken('  café — home ').label).toBe('café — home')
  })

  it('label normalization is independent of token generation (token still valid)', async () => {
    const { mintToken } = await loadStore()
    const out = mintToken('   ')
    expect(out.label).toBeNull()
    expect(out.token.startsWith('ext_')).toBe(true)
    expect(out.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('mintToken — deterministic crypto via mocked randomBytes', () => {
  it('builds the token from base64url(randomBytes(24)) and hashes the full token', async () => {
    // Fixed 24-byte buffer → deterministic base64url body + sha256.
    const fixed = Buffer.from([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
      12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    ])
    const expectedBody = fixed.toString('base64url')
    const expectedToken = `ext_${expectedBody}`
    const expectedHash = createHash('sha256').update(expectedToken).digest('hex')

    vi.resetModules()
    vi.doMock('node:crypto', async () => {
      const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto')
      return {
        ...actual,
        randomBytes: vi.fn((n: number) => {
          expect(n).toBe(24) // mint asks for exactly 24 bytes of entropy
          return fixed
        }),
      }
    })

    const { mintToken } = await import('./store')
    const out = mintToken('Deterministic')

    expect(out.token).toBe(expectedToken)
    expect(out.tokenHash).toBe(expectedHash)
    expect(out.label).toBe('Deterministic')
  })

  it('an all-zero entropy buffer still yields a well-formed ext_ token and matching hash', async () => {
    const zeros = Buffer.alloc(24, 0)
    const expectedToken = `ext_${zeros.toString('base64url')}`
    const expectedHash = createHash('sha256').update(expectedToken).digest('hex')

    vi.resetModules()
    vi.doMock('node:crypto', async () => {
      const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto')
      return { ...actual, randomBytes: vi.fn(() => zeros) }
    })

    const { mintToken } = await import('./store')
    const out = mintToken()

    expect(out.token).toBe(expectedToken)
    expect(out.token.length).toBe(36)
    expect(out.tokenHash).toBe(expectedHash)
    expect(out.label).toBeNull()
  })
})
