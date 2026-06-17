import { describe, it, expect } from 'vitest'
import { toItem, toView } from './store'

// Pure view-mapper unit tests (NO DB). toItem maps a DB contract_item row → view (Prisma Decimal → number,
// Date → ISO). toView maps a contract row → view, derives the viewer's role (contractor vs client), serializes
// dates, and lists items. These are the trust-boundary shapes the web reads, so pin field-by-field. All Dates
// are built from FIXED ISO literals for determinism (never `new Date()` / now-relative).

// A Prisma.Decimal stand-in: Number(x) coerces via valueOf/toString. amount is typed `unknown` and goes through
// Number(), so an object that stringifies to a numeric is exactly what the runtime sees from the DB driver.
const decimal = (s: string) => ({ toString: () => s, valueOf: () => Number(s) })

const ITEM_AT = new Date('2026-01-15T10:30:00.000Z')

const baseItem = {
  id: 'item_1',
  kind: 'milestone',
  title: 'Phase 1',
  description: 'first phase',
  amount: decimal('1500.50'),
  status: 'open',
  order: 0,
  createdAt: ITEM_AT,
}

const STARTED_AT = new Date('2026-02-01T00:00:00.000Z')
const ENDED_AT = new Date('2026-03-01T12:00:00.000Z')
const STANDUP_AT = new Date('2026-02-10T09:00:00.000Z')

const baseContract = {
  id: 'c_1',
  listingId: 'l_1',
  clientUserId: 'client_1',
  contractorUserId: 'contractor_1',
  boardRef: 'board_ref_1',
  title: 'Build the thing',
  rateType: 'hourly',
  rateAmount: decimal('85'),
  status: 'active',
  definitionOfDone: 'ship it',
  standupRequestedAt: STANDUP_AT,
  standupCadence: 'weekly',
  startedAt: STARTED_AT,
  endedAt: ENDED_AT,
  listing: { title: 'Listing Title' },
  items: [] as Parameters<typeof toItem>[0][],
}

describe('toItem — DB item row → view', () => {
  it('maps every field and converts a Decimal-like amount to a number', () => {
    const v = toItem(baseItem)
    expect(v).toEqual({
      id: 'item_1',
      kind: 'milestone',
      title: 'Phase 1',
      description: 'first phase',
      amount: 1500.5,
      status: 'open',
      order: 0,
      createdAt: '2026-01-15T10:30:00.000Z',
    })
    expect(typeof v.amount).toBe('number')
  })

  it('preserves a null description (no coercion to empty string)', () => {
    expect(toItem({ ...baseItem, description: null }).description).toBeNull()
  })

  it('passes amount === null straight through as null (not 0)', () => {
    const v = toItem({ ...baseItem, amount: null })
    expect(v.amount).toBeNull()
  })

  it('passes amount === undefined through as null (== null catches undefined)', () => {
    const v = toItem({ ...baseItem, amount: undefined })
    expect(v.amount).toBeNull()
  })

  it('coerces a numeric-string amount via Number()', () => {
    expect(toItem({ ...baseItem, amount: '42.25' }).amount).toBe(42.25)
  })

  it('coerces a plain-number amount unchanged', () => {
    expect(toItem({ ...baseItem, amount: 99 }).amount).toBe(99)
  })

  it('maps a zero amount as 0 (not nulled — distinct from absent)', () => {
    const v = toItem({ ...baseItem, amount: decimal('0') })
    expect(v.amount).toBe(0)
    expect(v.amount).not.toBeNull()
  })

  it('maps a negative amount as a negative number', () => {
    expect(toItem({ ...baseItem, amount: decimal('-12.5') }).amount).toBe(-12.5)
  })

  it('serializes createdAt to an ISO 8601 UTC string', () => {
    const v = toItem({ ...baseItem, createdAt: new Date('2025-12-31T23:59:59.999Z') })
    expect(v.createdAt).toBe('2025-12-31T23:59:59.999Z')
  })

  it('passes kind and status through verbatim (typed-cast only, no validation)', () => {
    const v = toItem({ ...baseItem, kind: 'deliverable', status: 'done' })
    expect(v.kind).toBe('deliverable')
    expect(v.status).toBe('done')
  })

  it('keeps an arbitrary non-zero order value', () => {
    expect(toItem({ ...baseItem, order: 7 }).order).toBe(7)
  })
})

describe('toView — DB contract row → view + role + items', () => {
  it('maps every scalar field, listingTitle, and Decimal rate to number', () => {
    const v = toView(baseContract, 'client_1')
    expect(v).toMatchObject({
      id: 'c_1',
      listingId: 'l_1',
      listingTitle: 'Listing Title',
      clientUserId: 'client_1',
      contractorUserId: 'contractor_1',
      boardRef: 'board_ref_1',
      title: 'Build the thing',
      rateType: 'hourly',
      rateAmount: 85,
      status: 'active',
      definitionOfDone: 'ship it',
      standupRequestedAt: '2026-02-10T09:00:00.000Z',
      standupCadence: 'weekly',
      startedAt: '2026-02-01T00:00:00.000Z',
      endedAt: '2026-03-01T12:00:00.000Z',
    })
    expect(typeof v.rateAmount).toBe('number')
  })

  it("derives role 'contractor' when the viewer is the contractorUserId", () => {
    expect(toView(baseContract, 'contractor_1').role).toBe('contractor')
  })

  it("derives role 'client' when the viewer is the clientUserId", () => {
    expect(toView(baseContract, 'client_1').role).toBe('client')
  })

  it("defaults role to 'client' for any non-contractor viewer (contractor is the only positive match)", () => {
    // The mapper does not assert participation; an unrelated viewer simply falls to 'client'.
    expect(toView(baseContract, 'stranger').role).toBe('client')
  })

  it("prefers 'contractor' when client and contractor ids are identical (contractor check wins)", () => {
    const c = { ...baseContract, clientUserId: 'same', contractorUserId: 'same' }
    expect(toView(c, 'same').role).toBe('contractor')
  })

  it('listingTitle is null when listing is null', () => {
    const v = toView({ ...baseContract, listing: null }, 'client_1')
    expect(v.listingTitle).toBeNull()
  })

  it('passes a null listingId through (native, no-listing contract)', () => {
    expect(toView({ ...baseContract, listingId: null }, 'client_1').listingId).toBeNull()
  })

  it('passes a null boardRef through', () => {
    expect(toView({ ...baseContract, boardRef: null }, 'client_1').boardRef).toBeNull()
  })

  it('passes a null definitionOfDone through', () => {
    expect(toView({ ...baseContract, definitionOfDone: null }, 'client_1').definitionOfDone).toBeNull()
  })

  it('standupRequestedAt is null when the date is null (no .toISOString crash)', () => {
    const v = toView({ ...baseContract, standupRequestedAt: null }, 'client_1')
    expect(v.standupRequestedAt).toBeNull()
  })

  it('serializes standupRequestedAt to ISO when present', () => {
    const v = toView(baseContract, 'client_1')
    expect(v.standupRequestedAt).toBe('2026-02-10T09:00:00.000Z')
  })

  it('passes a null standupCadence through', () => {
    expect(toView({ ...baseContract, standupCadence: null }, 'client_1').standupCadence).toBeNull()
  })

  it('endedAt is null when the date is null (open contract)', () => {
    const v = toView({ ...baseContract, endedAt: null }, 'client_1')
    expect(v.endedAt).toBeNull()
  })

  it('always serializes the required startedAt date to ISO', () => {
    const v = toView({ ...baseContract, startedAt: new Date('2026-06-15T08:00:00.000Z') }, 'client_1')
    expect(v.startedAt).toBe('2026-06-15T08:00:00.000Z')
  })

  it('coerces a numeric-string rateAmount via Number()', () => {
    expect(toView({ ...baseContract, rateAmount: '120.75' }, 'client_1').rateAmount).toBe(120.75)
  })

  it('maps a zero rateAmount as 0', () => {
    expect(toView({ ...baseContract, rateAmount: decimal('0') }, 'client_1').rateAmount).toBe(0)
  })

  it('passes rateType through verbatim (e.g. fixed)', () => {
    expect(toView({ ...baseContract, rateType: 'fixed' }, 'client_1').rateType).toBe('fixed')
  })

  it('passes status through verbatim (e.g. completed)', () => {
    expect(toView({ ...baseContract, status: 'completed' }, 'client_1').status).toBe('completed')
  })

  it('items is an empty array when items is an empty list', () => {
    expect(toView({ ...baseContract, items: [] }, 'client_1').items).toEqual([])
  })

  it('items is an empty array when items is undefined (list-card shape, no include)', () => {
    const { items, ...noItems } = baseContract
    expect(toView(noItems as typeof baseContract, 'client_1').items).toEqual([])
  })

  it('maps each item through toItem, preserving order of the input array', () => {
    const second = { ...baseItem, id: 'item_2', amount: decimal('200'), order: 1, createdAt: new Date('2026-01-16T00:00:00.000Z') }
    const v = toView({ ...baseContract, items: [baseItem, second] }, 'client_1')
    expect(v.items).toHaveLength(2)
    expect(v.items[0]!).toEqual(toItem(baseItem))
    expect(v.items[1]!.id).toBe('item_2')
    expect(v.items[1]!.amount).toBe(200)
    expect(v.items[1]!.order).toBe(1)
  })

  it('the mapped items carry Decimal→number amounts through the nested map', () => {
    const v = toView({ ...baseContract, items: [baseItem] }, 'contractor_1')
    expect(v.items[0]!.amount).toBe(1500.5)
    expect(typeof v.items[0]!.amount).toBe('number')
  })
})
