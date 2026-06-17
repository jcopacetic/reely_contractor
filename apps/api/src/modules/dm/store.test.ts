import { describe, it, expect } from 'vitest'
import { maxDate, unreadCutoff, renderRows, type RoomMsg } from './store'

// Pure-logic unit tests for the dm room store — NO DB. Importing the module is safe (prisma is lazy);
// none of the functions under test touch prisma or the network. Every Date is a FIXED ISO literal so
// assertions are deterministic and clock-independent (no `new Date()` / Math.random anywhere).

const T0 = new Date('2026-01-01T00:00:00.000Z') // earliest
const T1 = new Date('2026-03-15T08:30:00.000Z')
const T2 = new Date('2026-03-15T08:30:00.001Z') // T1 + 1ms (ordering edge)
const T3 = new Date('2026-06-16T23:59:59.999Z') // latest

// ── maxDate ──────────────────────────────────────────────────────────────────────────────
describe('maxDate', () => {
  it('returns b when a is null (no read cursor yet)', () => {
    expect(maxDate(null, T1)).toBe(T1)
  })

  it('returns a when a is strictly greater', () => {
    expect(maxDate(T3, T1)).toBe(T3)
  })

  it('returns b when b is strictly greater', () => {
    expect(maxDate(T0, T1)).toBe(T1)
  })

  it('returns b on exact equality (a is NOT > b)', () => {
    const a = new Date('2026-03-15T08:30:00.000Z')
    const b = new Date('2026-03-15T08:30:00.000Z')
    expect(maxDate(a, b)).toBe(b)
  })

  it('distinguishes a 1ms difference (picks the later instant)', () => {
    expect(maxDate(T2, T1)).toBe(T2)
    expect(maxDate(T1, T2)).toBe(T2)
  })

  it('the epoch (Date(0)) is a valid, non-null lower bound', () => {
    const epoch = new Date(0)
    expect(maxDate(epoch, T1)).toBe(T1)
    expect(maxDate(T1, epoch)).toBe(T1)
  })
})

// ── unreadCutoff (the unread-floor calc behind unreadFor) ────────────────────────────────
// unread = messages strictly after max(lastReadAt, joinedAt) not sent by the user. We test the cutoff.
describe('unreadCutoff', () => {
  it('falls back to joinedAt when never read (lastReadAt null) — join-gates the unread floor', () => {
    expect(unreadCutoff(T1, null)).toBe(T1)
  })

  it('uses lastReadAt once the user has read past their join', () => {
    expect(unreadCutoff(T1, T3)).toBe(T3)
  })

  it('never drops below joinedAt: a read cursor BEFORE join is ignored', () => {
    // A stale read cursor older than join must not resurrect pre-join history as unread.
    expect(unreadCutoff(T1, T0)).toBe(T1)
  })

  it('on equality returns joinedAt (the b arg of maxDate)', () => {
    const joined = new Date('2026-03-15T08:30:00.000Z')
    const read = new Date('2026-03-15T08:30:00.000Z')
    expect(unreadCutoff(joined, read)).toBe(joined)
  })

  it('tenant-style full-history members (joinedAt = epoch) floor at the read cursor', () => {
    expect(unreadCutoff(new Date(0), T1)).toBe(T1)
    expect(unreadCutoff(new Date(0), null)).toEqual(new Date(0))
  })
})

// ── renderRows (pure DB-row → RoomMsg[] transform) ───────────────────────────────────────
type MsgRow = Parameters<typeof renderRows>[0][number]

// Rows arrive NEWEST→oldest (as the query orders them). Helper builds one with sane defaults.
function row(over: Partial<MsgRow> = {}): MsgRow {
  return {
    id: 'm1',
    body: 'hello',
    senderUserId: 'u-a',
    senderTenantRef: null,
    senderLabel: null,
    createdAt: T1,
    ...over,
  }
}

describe('renderRows — ordering & shape', () => {
  it('returns [] for an empty row set', () => {
    expect(renderRows([], 'u-a', new Map())).toEqual([])
  })

  it('reverses newest→oldest input into oldest→newest output (and does NOT mutate the input)', () => {
    const input: MsgRow[] = [
      row({ id: 'newest', createdAt: T3 }),
      row({ id: 'middle', createdAt: T2 }),
      row({ id: 'oldest', createdAt: T1 }),
    ]
    const snapshot = input.map((r) => r.id)
    const out = renderRows(input, 'u-a', new Map())
    expect(out.map((m) => m.id)).toEqual(['oldest', 'middle', 'newest'])
    // input array order preserved (renderRows must slice, not reverse in place)
    expect(input.map((r) => r.id)).toEqual(snapshot)
  })

  it('maps every scalar field and ISO-stringifies createdAt', () => {
    const m = renderRows([row({ id: 'm9', body: 'yo', createdAt: T1 })], 'u-a', new Map([['u-a', 'Alice']]))[0]!
    expect(m).toEqual<RoomMsg>({
      id: 'm9',
      body: 'yo',
      fromMe: true,
      senderUserId: 'u-a',
      senderLabel: 'Alice',
      fromTenant: false,
      createdAt: '2026-03-15T08:30:00.000Z',
    })
  })
})

describe('renderRows — fromMe', () => {
  it('flags the viewer’s own messages and not others’', () => {
    const out = renderRows([row({ senderUserId: 'u-a' }), row({ id: 'm2', senderUserId: 'u-b' })], 'u-a', new Map())
    expect(out.find((m) => m.senderUserId === 'u-a')!.fromMe).toBe(true)
    expect(out.find((m) => m.senderUserId === 'u-b')!.fromMe).toBe(false)
  })

  it('a tenant message can still be fromMe when the viewer is the tenant member who sent it', () => {
    const m = renderRows([row({ senderUserId: 'u-mgr', senderTenantRef: 't-1', senderLabel: 'Pat · Acme' })], 'u-mgr', new Map())[0]!
    expect(m.fromMe).toBe(true)
    expect(m.fromTenant).toBe(true)
  })
})

describe('renderRows — contractor sender labels (names map)', () => {
  it('resolves a contractor’s displayName from the names map', () => {
    const m = renderRows([row({ senderUserId: 'u-a' })], 'viewer', new Map([['u-a', 'Alice Anders']]))[0]!
    expect(m.senderLabel).toBe('Alice Anders')
    expect(m.fromTenant).toBe(false)
  })

  it('falls back to "Contractor" when the sender is missing from the names map', () => {
    const m = renderRows([row({ senderUserId: 'ghost' })], 'viewer', new Map())[0]!
    expect(m.senderLabel).toBe('Contractor')
  })
})

describe('renderRows — tenant sender attribution (fromTenant)', () => {
  it('uses senderLabel verbatim for a tenant-side message and flags fromTenant', () => {
    const m = renderRows([row({ senderUserId: 'u-mgr', senderTenantRef: 't-1', senderLabel: 'Pat · Acme' })], 'viewer', new Map())[0]!
    expect(m.fromTenant).toBe(true)
    expect(m.senderLabel).toBe('Pat · Acme')
  })

  it('falls back to "Member" when a tenant message has no senderLabel', () => {
    const m = renderRows([row({ senderUserId: 'u-mgr', senderTenantRef: 't-1', senderLabel: null })], 'viewer', new Map())[0]!
    expect(m.fromTenant).toBe(true)
    expect(m.senderLabel).toBe('Member')
  })

  it('a tenant message IGNORES the names map (tenant label is not contractor profile)', () => {
    // Even if the sender id collides with a contractor name entry, tenant attribution wins.
    const m = renderRows(
      [row({ senderUserId: 'u-x', senderTenantRef: 't-1', senderLabel: 'Boss · Org' })],
      'viewer',
      new Map([['u-x', 'Should Not Use']]),
    )[0]!
    expect(m.senderLabel).toBe('Boss · Org')
  })

  it('renders a mixed thread: contractor + tenant rows side by side', () => {
    const input: MsgRow[] = [
      row({ id: 'm-tenant', senderUserId: 'u-mgr', senderTenantRef: 't-1', senderLabel: 'Pat · Acme', createdAt: T3 }),
      row({ id: 'm-contractor', senderUserId: 'u-a', createdAt: T1 }),
    ]
    const out = renderRows(input, 'u-a', new Map([['u-a', 'Alice']]))
    // oldest→newest: contractor first, tenant second
    expect(out.map((m) => [m.id, m.senderLabel, m.fromTenant, m.fromMe])).toEqual([
      ['m-contractor', 'Alice', false, true],
      ['m-tenant', 'Pat · Acme', true, false],
    ])
  })
})
