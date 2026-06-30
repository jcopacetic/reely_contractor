/**
 * Tiny in-memory fixed-window rate limiter. The API is a single long-running Fastify process on
 * Railway, so a process-local Map is a robust first line — no Redis dependency, no cold-start reset.
 * It complements (does not replace) the Vercel edge WAF; its job is to cap UNAUTHENTICATED abuse of
 * the public surface (probe floods, webhook bombing) cheaply. Legit service-to-service traffic carries
 * the service key and is exempted by the caller, so this never throttles the app itself.
 */
type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()
let writes = 0

function prune(now: number): void {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
}

export type RateVerdict = { ok: boolean; retryAfter: number }

/** Returns ok=false once `max` hits occur within `windowMs` for `key`. retryAfter is seconds. */
export function rateLimit(key: string, max: number, windowMs: number): RateVerdict {
  const now = Date.now()
  // Opportunistic prune so an attacker can't grow the Map unbounded with unique keys.
  if (++writes % 500 === 0) prune(now)
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfter: 0 }
  }
  b.count += 1
  if (b.count > max) return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) }
  return { ok: true, retryAfter: 0 }
}

/** Best-effort client IP behind Railway's proxy (Fastify has no trustProxy here). */
export function clientIp(headers: Record<string, unknown>, fallback: string): string {
  const xff = headers['x-forwarded-for']
  const first = (Array.isArray(xff) ? xff[0] : typeof xff === 'string' ? xff : '').split(',')[0]?.trim()
  return first || (typeof headers['x-real-ip'] === 'string' ? (headers['x-real-ip'] as string) : '') || fallback
}
