import { notFound } from 'next/navigation'
import { Briefcase, Clock, ExternalLink } from 'lucide-react'
import { apiQuery } from '@/lib/api'

export const dynamic = 'force-dynamic'

type PublicProfile = {
  displayName: string
  headline: string | null
  bio: string | null
  categories: string[]
  avatarUrl: string | null
  links: { label: string; url: string }[]
  contractsCompleted: number
  hoursLogged: number
} | null

/** Public marketing profile (linktree-style), reely.io/pro/[slug]. Safe-subset only, and only when is_public. */
export default async function PublicProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const p = await apiQuery<PublicProfile>('profile.getPublic', { slug }).catch(() => null)
  if (!p) return notFound()

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="text-center">
        {p.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatarUrl} alt={p.displayName} className="mx-auto mb-4 size-24 rounded-full object-cover" />
        ) : (
          <div className="mx-auto mb-4 grid size-24 place-items-center rounded-full bg-primary/10 font-display text-3xl font-bold text-primary">{p.displayName.charAt(0)}</div>
        )}
        <h1 className="font-display text-2xl font-bold tracking-tight">{p.displayName}</h1>
        {p.headline && <p className="mt-1 text-sm text-muted-foreground">{p.headline}</p>}
      </div>

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

      {p.links.length > 0 && (
        <div className="mt-6 space-y-2">
          {p.links.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-sm transition hover:border-primary/40">
              {l.label} <ExternalLink className="size-4 text-muted-foreground" />
            </a>
          ))}
        </div>
      )}

      <p className="mt-10 text-center text-[11px] text-muted-foreground">A Reely contractor · reely.io</p>
    </main>
  )
}
