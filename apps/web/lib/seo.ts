/**
 * SEO foundation for the contractor app — a minimal subset of catalog's lib/seo.ts: a metadata helper
 * (buildMetadata), the apex-hosted OG image URL builder (ogImage → https://reely.io/api/og), and a
 * Person / ProfilePage JSON-LD builder for the public marketing profile (/pro/[slug]).
 *
 * The OG image service + Organization knowledge graph live on the apex (catalog), so every social card
 * points at the one branded generator for the whole portfolio. SITE_URL is the reely.io apex.
 */
import type { Metadata } from 'next'

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://reely.io').replace(/\/$/, '')
export const SITE = SITE_URL
const APEX = 'https://reely.io' // the OG image service lives on the apex (catalog)

// ── share image (generated per page from its title) ───────────────────────────
export function ogImage(opts: { title: string; eyebrow?: string; subtitle?: string }): string {
  const p = new URLSearchParams({ title: opts.title })
  if (opts.eyebrow) p.set('eyebrow', opts.eyebrow)
  if (opts.subtitle) p.set('subtitle', opts.subtitle)
  return `${APEX}/api/og?${p.toString()}`
}

// ── per-page metadata (title/description/canonical + OG + Twitter card) ────────
export function buildMetadata(opts: {
  title: string
  description: string
  path: string
  type?: 'website' | 'profile'
  eyebrow?: string
  ogSubtitle?: string
  imageUrl?: string
}): Metadata {
  const url = `${SITE}${opts.path}`
  const image = opts.imageUrl ?? ogImage({ title: opts.title, eyebrow: opts.eyebrow, subtitle: opts.ogSubtitle ?? opts.description })
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      siteName: 'Reely',
      type: opts.type ?? 'website',
      images: [{ url: image, width: 1200, height: 630, alt: opts.title }],
    },
    twitter: { card: 'summary_large_image', title: opts.title, description: opts.description, images: [image] },
  }
}

// ── Person / ProfilePage JSON-LD for the public contractor profile ────────────
// Hand-typed (the contractor web app doesn't depend on schema-dts); shape matches schema.org Person
// nested inside a ProfilePage, which is the canonical structure for a public profile page.
export type PersonLd = {
  '@context': 'https://schema.org'
  '@type': 'ProfilePage'
  url: string
  mainEntity: {
    '@type': 'Person'
    name: string
    url: string
    description?: string
    jobTitle?: string
    image?: string
    knowsAbout?: string[]
    sameAs?: string[]
  }
}

export function profileLd(opts: {
  name: string
  slug: string
  description?: string | null
  headline?: string | null
  imageUrl?: string | null
  categories?: string[]
  sameAs?: string[]
}): PersonLd {
  const url = `${SITE}/pro/${opts.slug}`
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url,
    mainEntity: {
      '@type': 'Person',
      name: opts.name,
      url,
      ...(opts.description ? { description: opts.description } : {}),
      ...(opts.headline ? { jobTitle: opts.headline } : {}),
      ...(opts.imageUrl ? { image: opts.imageUrl } : {}),
      ...(opts.categories?.length ? { knowsAbout: opts.categories } : {}),
      ...(opts.sameAs?.length ? { sameAs: opts.sameAs } : {}),
    },
  }
}
