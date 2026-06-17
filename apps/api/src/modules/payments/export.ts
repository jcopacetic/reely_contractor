/**
 * ledger export — pure formatters that turn LedgerView rows into a downloadable CSV (or the rows are served
 * as JSON directly). RFC-4180-ish quoting: a cell is wrapped in double quotes when it contains a comma, quote,
 * or newline, and embedded quotes are doubled. No I/O — the router wraps these for the web download routes.
 */
import type { LedgerView } from './ledger'

const COLUMNS: Array<{ key: keyof LedgerView; header: string }> = [
  { key: 'occurredAt', header: 'date' },
  { key: 'kind', header: 'kind' },
  { key: 'succeeded', header: 'succeeded' },
  { key: 'grossAmount', header: 'gross' },
  { key: 'feeAmount', header: 'fee' },
  { key: 'netAmount', header: 'net' },
  { key: 'currency', header: 'currency' },
  { key: 'periodStart', header: 'period_start' },
  { key: 'periodEnd', header: 'period_end' },
  { key: 'taskCount', header: 'tasks' },
  { key: 'contractId', header: 'contract_id' },
  { key: 'description', header: 'description' },
]

export function csvCell(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** A CSV document (header row + one row per ledger entry). Always ends with a trailing newline. */
export function ledgerToCsv(rows: LedgerView[]): string {
  const header = COLUMNS.map((c) => c.header).join(',')
  const body = rows.map((r) => COLUMNS.map((c) => csvCell(r[c.key])).join(','))
  return [header, ...body].join('\n') + '\n'
}
