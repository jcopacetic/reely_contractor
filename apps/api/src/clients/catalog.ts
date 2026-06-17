/**
 * Catalog consume client — READ-ONLY. Powers the profile's industry picker (the catalog's broad→acute
 * taxonomy, same as the browse "all industries" filter) and the "tools I know" company search. HTTP-only via
 * the catalog's published service-key contracts (`catalog.industriesRead` + `catalog.searchProfiles` +
 * `catalog.profilesByIds`); when CATALOG_API_URL is unset every fn returns [] and the pickers degrade. NO
 * write path — stored company refs are cross-app references (catalog SaasOrg id/slug), never FKs.
 */
import { env } from '../env'

export type IndustryGroup = { slug: string; label: string; acutes: Array<{ slug: string; label: string }> }
export type CompanyHit = { id: string; name: string; slug: string; domain: string | null }

type RawProfile = { id: string; slug: string; name: string; domain?: string | null }

async function call(proc: string, input?: unknown): Promise<unknown> {
  const base = env.CATALOG_API_URL!.replace(/\/$/, '')
  const qs = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`
  const res = await fetch(`${base}/trpc/${proc}${qs}`, {
    headers: { 'x-portfolio-service-key': env.CATALOG_SERVICE_KEY ?? '', 'content-type': 'application/json' },
  })
  if (!res.ok) throw new Error(`catalog ${proc} ${res.status}`)
  const json = (await res.json()) as { result?: { data?: unknown } }
  return json.result?.data
}

/** The broad→acute industry taxonomy (the browse-filter tree). [] when env unset / on failure. */
export async function listIndustries(): Promise<IndustryGroup[]> {
  if (!env.CATALOG_API_URL) return []
  try {
    const data = (await call('catalog.industriesRead')) as IndustryGroup[] | null
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/** Search catalog COMPANIES by name (the "tools I know" recognition layer). [] when unset / empty / on failure. */
export async function searchCompanies(q: string, limit = 10): Promise<CompanyHit[]> {
  if (!env.CATALOG_API_URL) return []
  const needle = q.trim()
  if (!needle) return []
  try {
    const data = (await call('catalog.searchProfiles', { q: needle, limit })) as { profiles?: RawProfile[] } | null
    return (data?.profiles ?? []).map((p) => ({ id: p.id, name: p.name, slug: p.slug, domain: p.domain ?? null }))
  } catch {
    return []
  }
}

/** Resolve catalog SaasOrg ids → display refs (name/slug/domain) for rendering stored tool chips. [] on failure. */
export async function companiesByIds(ids: string[]): Promise<CompanyHit[]> {
  const want = [...new Set(ids)].filter(Boolean).slice(0, 100)
  if (!env.CATALOG_API_URL || !want.length) return []
  try {
    const data = (await call('catalog.profilesByIds', { ids: want })) as { profiles?: RawProfile[] } | null
    return (data?.profiles ?? []).map((p) => ({ id: p.id, name: p.name, slug: p.slug, domain: p.domain ?? null }))
  } catch {
    return []
  }
}
