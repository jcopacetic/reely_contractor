import { describe, it, expect } from 'vitest'
import { profileBlocks, isValidSlug, SLUG_RE, type Block } from './store'

// Pure-logic unit tests (NO DB). Two targets:
//   1. profileBlocks() — the view builder that turns stored blocks JSON into Block[], with the legacy-links
//      fallback (synthesize a single 'links' block from the flat `links` array when no blocks exist).
//   2. The slug validation — SLUG_RE + the lowercase/length(3–40)/pattern rules, extracted to the pure
//      isValidSlug() helper (the exact predicate update()/checkSlug() apply to the trimmed+lowercased value).
// These never call a function that touches prisma; importing the module is safe (prisma is lazy).

type Link = { label: string; url: string }

const LINK_A: Link = { label: 'Site', url: 'https://example.com' }
const LINK_B: Link = { label: 'GitHub', url: 'https://github.com/me' }

describe('profileBlocks — explicit stored blocks win', () => {
  it('returns the stored blocks verbatim (same reference) when present', () => {
    const stored: Block[] = [{ id: 'b1', type: 'text', body: 'hello' }]
    const out = profileBlocks(stored, [])
    expect(out).toBe(stored)
    expect(out).toEqual([{ id: 'b1', type: 'text', body: 'hello' }])
  })

  it('returns stored blocks even when legacy links are ALSO present (blocks take precedence)', () => {
    const stored: Block[] = [{ id: 'b1', type: 'list', title: 'Stack', items: ['ts'] }]
    const out = profileBlocks(stored, [LINK_A, LINK_B])
    expect(out).toBe(stored)
    // The fallback links block is NOT synthesized when real blocks exist.
    expect(out.some((b) => b.id === 'legacy-links')).toBe(false)
  })

  it('preserves multiple heterogeneous blocks and their order', () => {
    const stored: Block[] = [
      { id: 'b1', type: 'text', heading: 'About', body: 'bio' },
      { id: 'b2', type: 'links', title: 'Links', items: [LINK_A] },
      { id: 'b3', type: 'image', url: 'https://img/x.png', alt: 'x', caption: null },
      { id: 'b4', type: 'list', title: null, items: ['a', 'b'] },
    ]
    const out = profileBlocks(stored, [LINK_B])
    expect(out).toBe(stored)
    expect(out.map((b) => b.id)).toEqual(['b1', 'b2', 'b3', 'b4'])
  })
})

describe('profileBlocks — legacy-links fallback', () => {
  it('synthesizes a single links block from flat links when no blocks exist (null blocksJson)', () => {
    const out = profileBlocks(null, [LINK_A, LINK_B])
    expect(out).toEqual([{ id: 'legacy-links', type: 'links', title: 'Links', items: [LINK_A, LINK_B] }])
  })

  it('uses the SAME link items array in the synthesized block', () => {
    const links = [LINK_A]
    const out = profileBlocks(null, links)
    expect(out).toHaveLength(1)
    const block = out[0]
    expect(block?.type).toBe('links')
    if (block && block.type === 'links') {
      expect(block.items).toBe(links)
      expect(block.title).toBe('Links')
      expect(block.id).toBe('legacy-links')
    }
  })

  it('synthesizes from a single link too', () => {
    const out = profileBlocks(null, [LINK_A])
    expect(out).toEqual([{ id: 'legacy-links', type: 'links', title: 'Links', items: [LINK_A] }])
  })

  it('falls back when blocksJson is an empty array and links exist', () => {
    const out = profileBlocks([], [LINK_A])
    expect(out).toEqual([{ id: 'legacy-links', type: 'links', title: 'Links', items: [LINK_A] }])
  })
})

describe('profileBlocks — empty result', () => {
  it('returns [] when both blocks and links are empty (empty array blocksJson)', () => {
    expect(profileBlocks([], [])).toEqual([])
  })

  it('returns [] when blocksJson is null and links are empty', () => {
    expect(profileBlocks(null, [])).toEqual([])
  })

  it('returns [] when blocksJson is undefined and links are empty (nullish coalescing)', () => {
    expect(profileBlocks(undefined, [])).toEqual([])
  })

  it('synthesizes from links when blocksJson is undefined but links exist', () => {
    const out = profileBlocks(undefined, [LINK_A])
    expect(out).toEqual([{ id: 'legacy-links', type: 'links', title: 'Links', items: [LINK_A] }])
  })
})

describe('SLUG_RE — raw pattern', () => {
  it('matches lowercase alphanumerics and internal single hyphens', () => {
    expect(SLUG_RE.test('john')).toBe(true)
    expect(SLUG_RE.test('john-doe')).toBe(true)
    expect(SLUG_RE.test('a-b-c-1-2')).toBe(true)
    expect(SLUG_RE.test('abc123')).toBe(true)
    expect(SLUG_RE.test('1')).toBe(true)
  })

  it('rejects uppercase, leading/trailing/double hyphens, and disallowed chars', () => {
    expect(SLUG_RE.test('John')).toBe(false)
    expect(SLUG_RE.test('-john')).toBe(false)
    expect(SLUG_RE.test('john-')).toBe(false)
    expect(SLUG_RE.test('john--doe')).toBe(false)
    expect(SLUG_RE.test('john_doe')).toBe(false)
    expect(SLUG_RE.test('john.doe')).toBe(false)
    expect(SLUG_RE.test('john doe')).toBe(false)
    expect(SLUG_RE.test('')).toBe(false)
  })

  it('is anchored — rejects an otherwise-valid core with trailing junk', () => {
    expect(SLUG_RE.test('john\n')).toBe(false)
    expect(SLUG_RE.test('john!')).toBe(false)
  })
})

describe('isValidSlug — pattern + length window (the update()/checkSlug() predicate)', () => {
  it('accepts a typical valid slug', () => {
    expect(isValidSlug('john-doe')).toBe(true)
    expect(isValidSlug('contractor-42')).toBe(true)
  })

  it('rejects too-short slugs below the 3-char minimum', () => {
    expect(isValidSlug('ab')).toBe(false)
    expect(isValidSlug('a')).toBe(false)
    expect(isValidSlug('')).toBe(false)
  })

  it('accepts exactly the minimum length (3)', () => {
    expect(isValidSlug('abc')).toBe(true)
    expect('abc'.length).toBe(3)
  })

  it('accepts exactly the maximum length (40)', () => {
    const s = 'a'.repeat(40)
    expect(s.length).toBe(40)
    expect(isValidSlug(s)).toBe(true)
  })

  it('rejects one over the maximum (41)', () => {
    const s = 'a'.repeat(41)
    expect(s.length).toBe(41)
    expect(isValidSlug(s)).toBe(false)
  })

  it('rejects uppercase (callers lowercase BEFORE calling; a raw uppercase candidate is invalid)', () => {
    expect(isValidSlug('John-Doe')).toBe(false)
    expect(isValidSlug('ABC')).toBe(false)
  })

  it('rejects bad hyphen placement even within the length window', () => {
    expect(isValidSlug('-abc')).toBe(false)
    expect(isValidSlug('abc-')).toBe(false)
    expect(isValidSlug('ab--c')).toBe(false)
  })

  it('rejects disallowed characters even within the length window', () => {
    expect(isValidSlug('ab c')).toBe(false)
    expect(isValidSlug('ab_c')).toBe(false)
    expect(isValidSlug('ab.c')).toBe(false)
    expect(isValidSlug('café')).toBe(false)
  })

  it('does NOT trim/lowercase itself — that is the callers job (whitespace makes it invalid)', () => {
    expect(isValidSlug(' abc')).toBe(false)
    expect(isValidSlug('abc ')).toBe(false)
  })

  it('mirrors the caller pipeline: trim().toLowerCase() then validate', () => {
    const raw = '  John-Doe  '
    const normalized = raw.trim().toLowerCase()
    expect(normalized).toBe('john-doe')
    expect(isValidSlug(normalized)).toBe(true)
  })
})
