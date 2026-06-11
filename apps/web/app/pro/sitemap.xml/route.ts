import { apiQuery } from '@/lib/api'

/**
 * Public sitemap for contractor profiles — served at https://reely.io/pro/sitemap.xml (through the apex
 * `/pro` rewrite) and registered in the apex sitemap_index (catalog). Lists every is_public profile with
 * absolute apex URLs. Route handler (not the metadata convention) so it can't collide with /pro/[slug].
 */
export const revalidate = 3600

const SITE = 'https://reely.io'

type Entry = { slug: string; updatedAt: string }

export async function GET(): Promise<Response> {
  const profiles = await apiQuery<Entry[]>('profile.publicSitemap', undefined, { revalidate: 3600 }).catch(() => [] as Entry[])
  const urls = profiles
    .map((p) => `  <url><loc>${SITE}/pro/${encodeURIComponent(p.slug)}</loc><lastmod>${p.updatedAt}</lastmod></url>`)
    .join('\n')
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls +
    (urls ? '\n' : '') +
    `</urlset>\n`
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } })
}
