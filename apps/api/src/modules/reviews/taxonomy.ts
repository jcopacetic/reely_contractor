/**
 * Review vocabulary — the canonical kudos chips, the final-review dimensions, and the weekly pulse. Contractor
 * OWNS this (it owns reviews); the webs (contractor + Board's client form) mirror the keys for rendering. Keep
 * the KEYS in sync across copies — they're the stored contract; labels/emoji are presentation only.
 */
export const PULSES = ['up', 'neutral', 'down'] as const
export type Pulse = (typeof PULSES)[number]
export const isPulse = (v: unknown): v is Pulse => typeof v === 'string' && (PULSES as readonly string[]).includes(v)

/** Endorsement chips a client can tap (collected as LinkedIn-style badges on the public profile). */
export const KUDOS_KEYS = [
  'clear_comms',
  'fast',
  'above_beyond',
  'solved_hard',
  'reliable',
  'great_quality',
  'easy',
  'proactive',
] as const
export type KudosKey = (typeof KUDOS_KEYS)[number]
const KUDOS_SET = new Set<string>(KUDOS_KEYS)
const MAX_KUDOS = 4

/** Whitelist + dedupe + cap kudos keys from untrusted input. */
export function sanitizeKudos(input: unknown): KudosKey[] {
  if (!Array.isArray(input)) return []
  const out: KudosKey[] = []
  for (const v of input) {
    if (typeof v === 'string' && KUDOS_SET.has(v) && !out.includes(v as KudosKey)) out.push(v as KudosKey)
    if (out.length >= MAX_KUDOS) break
  }
  return out
}

/** The four star dimensions of a final review. */
export const DIMENSION_KEYS = ['communication', 'quality', 'timeliness', 'collaboration'] as const
export type DimensionKey = (typeof DIMENSION_KEYS)[number]
export type Dimensions = Record<DimensionKey, number>

/** Validate a dimensions map: every key present, each an int 1..5. Returns the clean map or null. */
export function parseDimensions(input: unknown): Dimensions | null {
  if (!input || typeof input !== 'object') return null
  const src = input as Record<string, unknown>
  const out = {} as Dimensions
  for (const k of DIMENSION_KEYS) {
    const n = Math.round(Number(src[k]))
    if (!Number.isFinite(n) || n < 1 || n > 5) return null
    out[k] = n
  }
  return out
}

/** Overall 1..5 = rounded mean of the four dimensions (drives the existing aggregate star). */
export const overallOf = (d: Dimensions): number =>
  Math.round(DIMENSION_KEYS.reduce((a, k) => a + d[k], 0) / DIMENSION_KEYS.length)
