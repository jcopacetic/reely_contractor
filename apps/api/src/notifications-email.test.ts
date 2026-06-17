import { createHmac } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { unsubToken, verifyUnsub, escapeHtml, buildDigest } from './notifications-email'

/**
 * UNIT tests for the PURE logic in notifications-email.ts. No DB / network: we only call
 * unsubToken / verifyUnsub / escapeHtml / buildDigest. Importing the module is safe (prisma /
 * resend / clerk clients instantiate lazily). All inputs are fixed literals (no clock, no random).
 *
 * In the test env neither NOTIFICATIONS_UNSUB_SECRET nor CLERK_SECRET_KEY are set, so the module's
 * SECRET falls back to the literal 'reely-notify-dev'; APP_BASE_URL defaults to 'https://reely.io'.
 * Both are deterministic, so we can recompute expected tokens/URLs here.
 */
const SECRET = 'reely-notify-dev'
const APP = 'https://reely.io'
const expectedToken = (userId: string) =>
  createHmac('sha256', SECRET).update(userId).digest('hex').slice(0, 32)

type Row = { id: string; userId: string; payload: unknown; createdAt: Date }
const AT = new Date('2026-01-02T03:04:05.000Z') // fixed timestamp; createdAt is unused by buildDigest
const row = (id: string, payload: unknown, userId = 'u1'): Row => ({ id, userId, payload, createdAt: AT })

describe('unsubToken', () => {
  it('returns a 32-char lowercase hex token', () => {
    const t = unsubToken('user_123')
    expect(t).toHaveLength(32)
    expect(t).toMatch(/^[0-9a-f]{32}$/)
  })

  it('is the first 32 hex chars of HMAC-SHA256(SECRET, userId)', () => {
    expect(unsubToken('user_123')).toBe(expectedToken('user_123'))
  })

  it('is deterministic — same input yields same token', () => {
    expect(unsubToken('abc')).toBe(unsubToken('abc'))
  })

  it('is unique per userId — different inputs yield different tokens', () => {
    expect(unsubToken('alice')).not.toBe(unsubToken('bob'))
  })

  it('handles the empty-string userId without throwing', () => {
    const t = unsubToken('')
    expect(t).toBe(expectedToken(''))
    expect(t).toMatch(/^[0-9a-f]{32}$/)
  })

  it('handles unicode / long userIds', () => {
    const id = 'user_🚀_' + 'x'.repeat(500)
    expect(unsubToken(id)).toBe(expectedToken(id))
  })
})

describe('verifyUnsub', () => {
  it('accepts a freshly minted token for the same userId', () => {
    expect(verifyUnsub('user_123', unsubToken('user_123'))).toBe(true)
  })

  it('accepts a token computed independently from the known SECRET', () => {
    expect(verifyUnsub('user_123', expectedToken('user_123'))).toBe(true)
  })

  it("rejects another user's valid token (HMAC binds to userId)", () => {
    expect(verifyUnsub('alice', unsubToken('bob'))).toBe(false)
  })

  it('rejects a token of the correct length but wrong content', () => {
    // 32 hex chars, but not the right HMAC.
    expect(verifyUnsub('user_123', '0'.repeat(32))).toBe(false)
  })

  it('rejects a too-short token (length guard, no throw)', () => {
    const t = unsubToken('user_123')
    expect(verifyUnsub('user_123', t.slice(0, 31))).toBe(false)
  })

  it('rejects a too-long token (length guard, no throw)', () => {
    const t = unsubToken('user_123')
    expect(verifyUnsub('user_123', t + 'a')).toBe(false)
  })

  it('rejects an empty-string token', () => {
    expect(verifyUnsub('user_123', '')).toBe(false)
  })

  it('rejects non-string token inputs without throwing', () => {
    expect(verifyUnsub('user_123', undefined as unknown as string)).toBe(false)
    expect(verifyUnsub('user_123', null as unknown as string)).toBe(false)
    expect(verifyUnsub('user_123', 12345 as unknown as string)).toBe(false)
    expect(verifyUnsub('user_123', {} as unknown as string)).toBe(false)
  })

  it('round-trips for the empty-string userId', () => {
    expect(verifyUnsub('', unsubToken(''))).toBe(true)
  })

  it('is case-sensitive — uppercasing a valid token fails', () => {
    const t = unsubToken('user_123')
    const upper = t.toUpperCase()
    // toUpperCase only changes a-f letters; if the token had none it would equal t (still valid),
    // so only assert mismatch when the case actually changed.
    if (upper !== t) expect(verifyUnsub('user_123', upper)).toBe(false)
    else expect(verifyUnsub('user_123', upper)).toBe(true)
  })
})

describe('escapeHtml', () => {
  it('escapes all five special characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('escapes ampersand first so existing entities are double-escaped (safe)', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;')
  })

  it('neutralizes a script-tag injection attempt', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })

  it('escapes attribute-breaking quotes', () => {
    expect(escapeHtml(`" onmouseover="x`)).toBe('&quot; onmouseover=&quot;x')
    expect(escapeHtml(`it's`)).toBe('it&#39;s')
  })

  it('leaves a plain string untouched', () => {
    expect(escapeHtml('Hello world 123 - ok.')).toBe('Hello world 123 - ok.')
  })

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('escapes every occurrence, not just the first', () => {
    expect(escapeHtml('<<>>')).toBe('&lt;&lt;&gt;&gt;')
  })

  it('preserves non-ASCII / unicode characters as-is', () => {
    expect(escapeHtml('café 🚀 <b>')).toBe('café 🚀 &lt;b&gt;')
  })
})

describe('buildDigest', () => {
  it('uses the singular subject + "update" wording for exactly one item', () => {
    const out = buildDigest('Jane', 'u1', [row('n1', { title: 'New bid' })])
    expect(out.subject).toBe('1 update on your Reely contract')
    expect(out.text).toContain('You have 1 unread update:')
    expect(out.html).toContain('<strong>1</strong> unread update on Reely')
  })

  it('uses the plural subject + "updates" wording for multiple items', () => {
    const out = buildDigest('Jane', 'u1', [
      row('n1', { title: 'A' }),
      row('n2', { title: 'B' }),
    ])
    expect(out.subject).toBe('2 updates on your Reely contracts')
    expect(out.text).toContain('You have 2 unread updates:')
    expect(out.html).toContain('<strong>2</strong> unread updates on Reely')
  })

  it('greets by first name when provided', () => {
    const out = buildDigest('Jane', 'u1', [row('n1', { title: 'A' })])
    expect(out.text.startsWith('Hi Jane,')).toBe(true)
    expect(out.html).toContain('<p>Hi Jane,</p>')
  })

  it('falls back to a bare "Hi," when firstName is null', () => {
    const out = buildDigest(null, 'u1', [row('n1', { title: 'A' })])
    expect(out.text.startsWith('Hi,')).toBe(true)
    expect(out.html).toContain('<p>Hi,</p>')
  })

  it('renders "title — contractTitle" when a contractTitle is present', () => {
    const out = buildDigest('J', 'u1', [
      row('n1', { title: 'New message', contractTitle: 'Landing page' }),
    ])
    expect(out.text).toContain('• New message — Landing page')
    expect(out.html).toContain('<li style="margin:4px 0">New message — Landing page</li>')
  })

  it('renders just the title when contractTitle is absent', () => {
    const out = buildDigest('J', 'u1', [row('n1', { title: 'Standalone' })])
    expect(out.text).toContain('• Standalone')
    expect(out.html).not.toContain(' — ')
  })

  it('defaults a missing/blank title to "Update"', () => {
    const out = buildDigest('J', 'u1', [
      row('n1', {}),
      row('n2', { title: 123 }), // non-string title → null → "Update"
      row('n3', null),
    ])
    expect(out.text).toContain('• Update')
    // all three rows fall back to "Update"
    expect(out.text.match(/• Update/g)).toHaveLength(3)
  })

  it('escapes HTML in the title/contractTitle in the HTML body but not the plain text', () => {
    const out = buildDigest('J', 'u1', [
      row('n1', { title: '<b>x</b>', contractTitle: 'A & B' }),
    ])
    expect(out.html).toContain('&lt;b&gt;x&lt;/b&gt; — A &amp; B')
    expect(out.html).not.toContain('<b>x</b>')
    // plain text is unescaped
    expect(out.text).toContain('• <b>x</b> — A & B')
  })

  it('does NOT escape the greeting name in HTML (known shape — guards against silent change)', () => {
    const out = buildDigest('<b>', 'u1', [row('n1', { title: 'A' })])
    expect(out.html).toContain('<p>Hi <b>,</p>')
  })

  it('lists at most 10 items and appends a "…and N more." footer', () => {
    const items = Array.from({ length: 13 }, (_, i) => row(`n${i}`, { title: `T${i}` }))
    const out = buildDigest('J', 'u1', items)
    expect(out.subject).toBe('13 updates on your Reely contracts')
    // exactly 10 bullets in text
    expect(out.text.match(/• T\d+/g)).toHaveLength(10)
    // 10 <li> in html
    expect(out.html.match(/<li /g)).toHaveLength(10)
    expect(out.text).toContain('…and 3 more.')
    expect(out.html).toContain('<p style="color:#666">…and 3 more.</p>')
    // the 11th+ items are not rendered
    expect(out.text).not.toContain('T10')
  })

  it('shows exactly 10 items and NO "more" footer at the boundary of 10', () => {
    const items = Array.from({ length: 10 }, (_, i) => row(`n${i}`, { title: `T${i}` }))
    const out = buildDigest('J', 'u1', items)
    expect(out.text.match(/• T\d+/g)).toHaveLength(10)
    expect(out.text).not.toContain('more.')
    expect(out.html).not.toContain('color:#666')
  })

  it('builds the app + unsubscribe URLs with an HMAC token and encoded userId', () => {
    const userId = 'user 123/&'
    const out = buildDigest('J', userId, [row('n1', { title: 'A' }, userId)])
    const tok = expectedToken(userId)
    const expectedUnsub = `${APP}/contractor/unsubscribe?u=${encodeURIComponent(userId)}&t=${tok}`
    expect(out.text).toContain(`See them all: ${APP}/contractor/notifications`)
    expect(out.text).toContain(`Unsubscribe from these emails: ${expectedUnsub}`)
    expect(out.html).toContain(`href="${APP}/contractor/notifications"`)
    expect(out.html).toContain(`href="${expectedUnsub}"`)
    // the token in the URL verifies for that user
    expect(verifyUnsub(userId, tok)).toBe(true)
  })

  it('produces empty list markup for zero items (uses plural wording, n=0)', () => {
    const out = buildDigest('J', 'u1', [])
    expect(out.subject).toBe('0 updates on your Reely contracts')
    expect(out.text).toContain('You have 0 unread updates:')
    expect(out.html).toContain('<ul style="padding-left:18px"></ul>')
    expect(out.text).not.toContain('more.')
  })

  it('returns the three expected string fields', () => {
    const out = buildDigest('J', 'u1', [row('n1', { title: 'A' })])
    expect(Object.keys(out).sort()).toEqual(['html', 'subject', 'text'])
    expect(typeof out.subject).toBe('string')
    expect(typeof out.html).toBe('string')
    expect(typeof out.text).toBe('string')
  })

  it('drops blank text lines via filter(Boolean) so there is no empty "more" line', () => {
    const out = buildDigest('J', 'u1', [row('n1', { title: 'A' })])
    // when there's no "more", the text must not contain a stray blank where it would have been;
    // assert the See-them-all line directly follows the single bullet block region.
    expect(out.text).not.toMatch(/\n\n\nSee them all/)
  })
})
