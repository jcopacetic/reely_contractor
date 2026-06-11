import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

/**
 * Contractor-zone robots. Public marketing profiles (/pro/) are crawlable; the gated app (/contractor/,
 * applicant flow + dashboard/feed/dms/profile) is fenced off. The apex robots.txt is authoritative for
 * the site as a whole — we reference the apex sitemap index (the public-profile sitemap is wired into it
 * separately by the lead).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/pro/', disallow: '/contractor/' }],
    sitemap: `${SITE_URL}/sitemap_index.xml`,
    host: SITE_URL,
  }
}
