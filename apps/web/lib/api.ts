import { auth } from '@clerk/nextjs/server'

/**
 * Server-only contractor-api client. The browser NEVER calls the api: this runs in RSC/server actions,
 * holds the service key, and presents the verified acting user + role (from Clerk) as headers. tRPC v11,
 * no transformer → query = GET ?input=<json>, mutation = POST raw body; response = { result: { data } }.
 */
const BASE = (process.env.CONTRACTOR_API_URL ?? 'http://localhost:3101').replace(/\/$/, '')
const KEY = process.env.CONTRACTOR_SERVICE_KEY ?? ''

async function actingHeaders(): Promise<Record<string, string>> {
  const { userId, sessionClaims } = await auth()
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role
  return {
    'x-contractor-service-key': KEY,
    ...(userId ? { 'x-acting-user': userId } : {}),
    ...(role ? { 'x-acting-role': role } : {}),
  }
}

export async function apiQuery<T>(proc: string, input?: unknown): Promise<T> {
  const headers = await actingHeaders()
  const qs = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`
  const res = await fetch(`${BASE}/trpc/${proc}${qs}`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error(`contractor ${proc} ${res.status}`)
  const json = (await res.json()) as { result?: { data?: T } }
  return json.result?.data as T
}

export async function apiMutate<T>(proc: string, input?: unknown): Promise<T> {
  const headers = await actingHeaders()
  const res = await fetch(`${BASE}/trpc/${proc}`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(input ?? {}),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`contractor ${proc} ${res.status}: ${await res.text().catch(() => '')}`)
  const json = (await res.json()) as { result?: { data?: T } }
  return json.result?.data as T
}
