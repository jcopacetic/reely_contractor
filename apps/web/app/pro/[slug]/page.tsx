import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BadgeCheck, Briefcase, Clock, ExternalLink, Star } from 'lucide-react'
import { apiQuery } from '@/lib/api'
import { JsonLd } from '@/components/json-ld'
import { HireBox } from './hire-box'
import { buildMetadata, ogImage, profileLd } from '@/lib/seo'
import { safeUrl, type Block } from '@/lib/profile-blocks'
import { DIMENSIONS, kudosMeta, pulseMeta, type Dimensions, type Pulse } from '@/lib/reviews'

// ISR: the public profile is anonymous + safe-subset; the read is cache-friendly (revalidate below),
// so the page no longer needs `force-dynamic`. Authenticated club pages keep `no-store` (lib/api.ts).
export const revalidate = 3600

type PublicProfile = {
  displayName: string
  company: string | null
  position: string | null
  headline: string | null
  bio: string | null
  categories: string[]
  avatarUrl: string | null
  links: { label: string; url: string }[]
  blocks: Block[]
  contractsCompleted: number
  hoursLogged: number
  vetted: boolean
  availability: { state: 'available' | 'away' | 'unavailable'; capacityHours: number | null; awayUntil: string | null }
  ratePublic: number | null
  location: string | null
  reviews: {
    avg: number
    count: number
    dimensionAvgs: Dimensions | null
    kudos: Array<{ key: string; count: number }>
    items: Array<{ id: string; kind: string; rating: number | null; pulse: Pulse | null; dimensions: Dimensions | null; kudos: string[]; body: string | null; authorLabel: string | null; createdAt: string }>
  }
} | null

const REVALIDATE = 3600

async function getProfile(slug: string): Promise<PublicProfile> {
  return apiQuery<PublicProfile>('profile.getPublic', { slug }, { revalidate: REVALIDATE }).catch(() => null)
}

// The availability chip: one derived status, color-coded. Away formats the return date (UTC, deterministic for ISR).
function availabilityChip(a: NonNullable<PublicProfile>['availability']): { label: string; cls: string; dot: string } {
  if (a.state === 'away') {
    const when = a.awayUntil ? new Date(a.awayUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : null
    return { label: when ? `Away until ${when}` : 'Away', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', dot: 'bg-amber-500' }
  }
  if (a.state === 'unavailable') return { label: 'Not accepting work', cls: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/50' }
  const label = a.capacityHours ? `Available · ~${a.capacityHours} hrs/wk` : 'Available for work'
  return { label, cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' }
}

function describe(p: NonNullable<PublicProfile>): string {
  if (p.bio?.trim()) return p.bio.trim().replace(/\s+/g, ' ').slice(0, 200)
  if (p.headline?.trim()) return p.headline.trim()
  if (p.categories.length) return `${p.displayName} — ${p.categories.join(', ')}. A vetted Reely contractor.`
  return `${p.displayName} is a vetted contractor on Reely.`
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const p = await getProfile(slug)
  if (!p) return { title: 'Profile not found — Reely', robots: { index: false, follow: false } }
  const description = describe(p)
  return buildMetadata({
    title: `${p.displayName} — Reely`,
    description,
    path: `/pro/${slug}`,
    type: 'profile',
    eyebrow: 'Contractor',
    ogSubtitle: p.headline ?? undefined,
    imageUrl: p.avatarUrl ? undefined : ogImage({ title: p.displayName, eyebrow: 'Contractor', subtitle: p.headline ?? description }),
  })
}

/** Public marketing profile (linktree-style), reely.io/pro/[slug]. Safe-subset only, and only when is_public. */
export default async function PublicProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const p = await getProfile(slug)
  if (!p) return notFound()

  const linkUrls = p.blocks.flatMap((b) => (b.type === 'links' ? b.items.map((l) => l.url) : []))
  const ld = profileLd({
    name: p.displayName,
    slug,
    description: describe(p),
    headline: p.headline,
    imageUrl: p.avatarUrl,
    categories: p.categories,
    sameAs: linkUrls,
  })

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <JsonLd data={ld} />
      <div className="text-center">
        {p.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatarUrl} alt={p.displayName} className="mx-auto mb-4 size-24 rounded-full object-cover" />
        ) : (
          <div className="mx-auto mb-4 grid size-24 place-items-center rounded-full bg-primary/10 font-display text-3xl font-bold text-primary">{p.displayName.charAt(0)}</div>
        )}
        <h1 className="font-display text-2xl font-bold tracking-tight">{p.displayName}</h1>
        {(p.position || p.company) && (
          <p className="mt-1 text-sm font-medium text-foreground/80">{[p.position, p.company].filter(Boolean).join(' · ')}</p>
        )}
        {p.headline && <p className="mt-1 text-sm text-muted-foreground">{p.headline}</p>}
        {/* Trust + availability — the vetted badge is the platform's core conversion signal; the chip says "can I hire them?" */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          {p.vetted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary" title="Screened and approved by Reely">
              <BadgeCheck className="size-3.5" /> Vetted contractor
            </span>
          )}
          {(() => { const c = availabilityChip(p.availability); return (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${c.cls}`}>
              <span className={`size-1.5 rounded-full ${c.dot}`} /> {c.label}
            </span>
          ) })()}
        </div>
      </div>

      <HireBox slug={slug} displayName={p.displayName} ratePublic={p.ratePublic} location={p.location} accepting={p.availability.state === 'available'} />

      {(p.contractsCompleted > 0 || p.hoursLogged > 0) && (
        <div className="mt-5 flex justify-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-muted-foreground"><Briefcase className="size-3.5" /> {p.contractsCompleted} contract{p.contractsCompleted === 1 ? '' : 's'}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-muted-foreground"><Clock className="size-3.5" /> {Math.round(p.hoursLogged)} hrs</span>
        </div>
      )}

      {p.bio && <p className="mt-5 whitespace-pre-line text-center text-sm text-foreground/90">{p.bio}</p>}

      {p.categories.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {p.categories.map((c) => <span key={c} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">{c}</span>)}
        </div>
      )}

      {p.blocks.length > 0 && (
        <div className="mt-6 space-y-6">
          {p.blocks.map((b) => <BlockView key={b.id} block={b} />)}
        </div>
      )}

      {/* Reviews — every final review + the weekly reviews the contractor approved for display. */}
      <section className="mt-8">
        <h2 className="mb-2 flex items-center justify-between font-display text-sm font-semibold text-muted-foreground">
          <span>Reviews</span>
          {p.reviews.avg > 0 && (
            <span className="inline-flex items-center gap-1 text-foreground"><Star className="size-3.5 fill-amber-400 text-amber-400" /> {p.reviews.avg.toFixed(1)} <span className="text-muted-foreground">({p.reviews.count})</span></span>
          )}
        </h2>
        {p.reviews.count === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-5 text-center text-xs text-muted-foreground">No reviews yet — client reviews will appear here.</div>
        ) : (
          <div className="space-y-3">
            {/* Per-dimension averages + collectible kudos badges (the at-a-glance reputation). */}
            {(p.reviews.dimensionAvgs || p.reviews.kudos.length > 0) && (
              <div className="rounded-xl border border-border bg-card p-4">
                {p.reviews.dimensionAvgs && (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                    {DIMENSIONS.map((d) => (
                      <div key={d.key}>
                        <div className="text-[11px] text-muted-foreground">{d.label}</div>
                        <div className="flex items-center gap-1 text-sm font-semibold"><Star className="size-3.5 fill-amber-400 text-amber-400" /> {p.reviews.dimensionAvgs![d.key].toFixed(1)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {p.reviews.kudos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                    {p.reviews.kudos.map((k) => { const m = kudosMeta(k.key); return <span key={k.key} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{m.emoji} {m.label}{k.count > 1 && <span className="text-muted-foreground">×{k.count}</span>}</span> })}
                  </div>
                )}
              </div>
            )}
            {/* Testimonials — final comments + approved weekly notes. */}
            <ul className="space-y-2">
              {p.reviews.items.map((r) => (
                <li key={r.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center gap-1.5">
                    {typeof r.rating === 'number' && (
                      <span className="inline-flex" aria-label={`${r.rating} of 5`}>
                        {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`size-3.5 ${i <= r.rating! ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />)}
                      </span>
                    )}
                    {r.kind === 'weekly' && r.pulse && <span className="text-sm">{pulseMeta(r.pulse)?.emoji}</span>}
                    {r.kind === 'final' && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Final</span>}
                  </div>
                  {r.kudos.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {r.kudos.map((k) => { const m = kudosMeta(k); return <span key={k} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">{m.emoji} {m.label}</span> })}
                    </div>
                  )}
                  {r.body && <p className="mt-1.5 whitespace-pre-line text-sm text-foreground/90">{r.body}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">— {r.authorLabel ?? 'Client'}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <p className="mt-10 text-center text-[11px] text-muted-foreground">A Reely contractor · reely.io</p>
    </main>
  )
}

/** Render one landing-page block in Reely's styling (structure is ours; content is the contractor's). */
function BlockView({ block }: { block: Block }) {
  if (block.type === 'text') {
    return (
      <section>
        {block.heading && <h2 className="mb-1.5 font-display text-base font-semibold">{block.heading}</h2>}
        <p className="whitespace-pre-line text-sm text-foreground/90">{block.body}</p>
      </section>
    )
  }
  if (block.type === 'links') {
    return (
      <section className="space-y-2">
        {block.title && <h2 className="font-display text-sm font-semibold text-muted-foreground">{block.title}</h2>}
        {block.items.map((l, i) => {
          const href = safeUrl(l.url)
          if (!href) return null
          return (
            <a key={i} href={href} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-sm transition hover:border-primary/40">
              {l.label} <ExternalLink className="size-4 text-muted-foreground" />
            </a>
          )
        })}
      </section>
    )
  }
  if (block.type === 'image') {
    return (
      <figure>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={block.url} alt={block.alt ?? ''} className="w-full rounded-xl border border-border object-cover" />
        {block.caption && <figcaption className="mt-1.5 text-center text-xs text-muted-foreground">{block.caption}</figcaption>}
      </figure>
    )
  }
  return (
    <section>
      {block.title && <h2 className="mb-1.5 font-display text-base font-semibold">{block.title}</h2>}
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
        {block.items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </section>
  )
}
