import { describe, it, expect } from 'vitest'
import { csvCell, ledgerToCsv } from './export'
import type { LedgerView } from './ledger'

const row = (over: Partial<LedgerView> = {}): LedgerView => ({
  id: 'x', kind: 'charge', contractId: 'c1', boardRef: null, grossAmount: 100, feeAmount: 5, netAmount: 95,
  currency: 'usd', description: 'Weekly work', periodStart: '2026-05-04T00:00:00.000Z', periodEnd: '2026-05-11T00:00:00.000Z',
  taskCount: 3, totalSeconds: 3600, succeeded: true, failureReason: null, occurredAt: '2026-05-18T18:00:00.000Z', ...over,
})

describe('csvCell', () => {
  it('passes plain values through', () => {
    expect(csvCell('hello')).toBe('hello')
    expect(csvCell(42)).toBe('42')
    expect(csvCell(true)).toBe('true')
  })
  it('renders null/undefined as empty', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })
  it('quotes + escapes cells containing comma, quote, or newline', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('she said "hi"')).toBe('"she said ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
    expect(csvCell('has\rcr')).toBe('"has\rcr"')
  })
})

describe('ledgerToCsv', () => {
  it('emits a header row + one row per entry, trailing newline', () => {
    const csv = ledgerToCsv([row()])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('date,kind,succeeded,gross,fee,net,currency,period_start,period_end,tasks,contract_id,description')
    expect(lines[1]).toBe('2026-05-18T18:00:00.000Z,charge,true,100,5,95,usd,2026-05-04T00:00:00.000Z,2026-05-11T00:00:00.000Z,3,c1,Weekly work')
    expect(csv.endsWith('\n')).toBe(true)
    expect(lines).toHaveLength(3) // header + 1 row + the trailing-newline empty element
  })
  it('header-only for an empty ledger', () => {
    expect(ledgerToCsv([])).toBe('date,kind,succeeded,gross,fee,net,currency,period_start,period_end,tasks,contract_id,description\n')
  })
  it('escapes a description with a comma + quotes, and blanks null period fields', () => {
    const csv = ledgerToCsv([row({ kind: 'charge_failed', succeeded: false, description: 'Declined, retry "soon"', periodStart: null, periodEnd: null })])
    const cells = csv.split('\n')[1]!
    expect(cells).toContain('"Declined, retry ""soon"""')
    expect(cells).toContain('charge_failed,false,')
    expect(cells).toContain(',usd,,,3,') // empty period_start + period_end between currency and tasks
  })
  it('preserves row order', () => {
    const csv = ledgerToCsv([row({ contractId: 'first' }), row({ contractId: 'second' })])
    const lines = csv.split('\n')
    expect(lines[1]).toContain(',first,')
    expect(lines[2]).toContain(',second,')
  })
})
