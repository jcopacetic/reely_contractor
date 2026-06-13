/**
 * Pure timestamp formatters in a given IANA timezone (the viewer's). Client- and server-safe (no imports).
 * Storage is always UTC; these render it in the viewer's tz. `tz` null → UTC. Durations (hm/hms) are
 * tz-independent and stay where they are.
 */
const TZ = (tz: string | null | undefined) => tz || 'UTC'

/** Date + time, e.g. "Jun 13, 2026, 2:30 PM" in the viewer's tz. */
export function fmtDateTime(value: string | number | Date, tz: string | null): string {
  return new Date(value).toLocaleString('en-US', { timeZone: TZ(tz), month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Date only; pass `opts` to override (e.g. `{ month: 'short', day: 'numeric' }`). */
export function fmtDate(value: string | number | Date, tz: string | null, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleDateString('en-US', { timeZone: TZ(tz), ...(opts ?? { month: 'short', day: 'numeric', year: 'numeric' }) })
}
