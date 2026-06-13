import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { apiQuery } from '@/lib/api'
import { FollowButton } from '@/components/follow-button'
import { MessageButton } from '@/components/message-button'
import { Feed, type FeedPost } from '@/components/feed'

export const dynamic = 'force-dynamic'

type Badge = { key: string; name: string; description: string | null; xp: number; awardedAt: string }
type ClubProfile = {
  userId: string
  displayName: string
  company: string | null
  position: string | null
  headline: string | null
  bio: string | null
  categories: string[]
  avatarUrl: string | null
  publicSlug: string | null
  links: { label: string; url: string }[]
  contractsCompleted: number
  hoursLogged: number
  followerCount: number
  followingCount: number
  isFollowing: boolean
  isSelf: boolean
  level: number
  xp: number
  streak: number
  achievements: Badge[]
}
type Own = { profile: { displayName: string; avatarUrl: string | null } | null }

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
}

// An in-club member profile: full header (avatar, headline, bio, skills, links, stats, follow) + their posts.
// Distinct from the anonymous public /pro/[slug] — this is the authenticated members' view.
export default async function ClubMemberPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const [profile, own, posts] = await Promise.all([
    apiQuery<ClubProfile | null>('graph.profile', { userId }).catch(() => null),
    apiQuery<Own>('profile.getOwn').catch(() => ({ profile: null }) as Own),
    apiQuery<FeedPost[]>('feed.byAuthor', { userId }).catch(() => [] as FeedPost[]),
  ])
  if (!profile) notFound()

  const me = { displayName: own.profile?.displayName ?? 'You', avatarUrl: own.profile?.avatarUrl ?? null }

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-4">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="size-16 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary/10 font-display text-xl font-semibold text-primary">{initials(profile.displayName)}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-xl font-bold tracking-tight">{profile.displayName}</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary" title={`${profile.xp} XP`}>Lv {profile.level}</span>
                {profile.streak > 1 && <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600" title="Day streak">🔥 {profile.streak}</span>}
              </div>
              {(profile.position || profile.company) && (
                <p className="text-sm font-medium text-foreground/80">{[profile.position, profile.company].filter(Boolean).join(' · ')}</p>
              )}
              {profile.headline && <p className="text-sm text-muted-foreground">{profile.headline}</p>}
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span><strong className="text-foreground">{profile.followerCount}</strong> followers</span>
                <span><strong className="text-foreground">{profile.followingCount}</strong> following</span>
                {profile.contractsCompleted > 0 && <span><strong className="text-foreground">{profile.contractsCompleted}</strong> contracts</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {profile.isSelf ? (
                <a href="/contractor/profile" className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">Edit profile</a>
              ) : (
                <>
                  <MessageButton userId={profile.userId} />
                  <FollowButton userId={profile.userId} initialFollowing={profile.isFollowing} initialFollowerCount={profile.followerCount} />
                </>
              )}
            </div>
          </div>

          {profile.bio && <p className="mt-4 whitespace-pre-line text-sm">{profile.bio}</p>}

          {profile.categories.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {profile.categories.map((c) => (
                <span key={c} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">{c}</span>
              ))}
            </div>
          )}

          {profile.links.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.links.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs text-foreground hover:bg-muted/70">
                  {l.label} <ExternalLink className="size-3" />
                </a>
              ))}
            </div>
          )}

          {profile.publicSlug && (
            <a href={`/pro/${profile.publicSlug}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs text-primary hover:underline">
              View public profile <ExternalLink className="size-3" />
            </a>
          )}
        </section>

        {profile.achievements.length > 0 && (
          <section className="mt-4 rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Achievements</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {profile.achievements.map((b) => (
                <div key={b.key} className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-lg">🏆</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{b.name} <span className="font-normal text-muted-foreground">· +{b.xp} XP</span></p>
                    {b.description && <p className="text-xs text-muted-foreground">{b.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-6">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Posts</h2>
          <Feed
            initial={posts}
            me={me}
            composer={false}
            emptyText={profile.isSelf ? "You haven't posted yet." : `${profile.displayName} hasn't posted yet.`}
          />
        </div>
      </main>
    </>
  )
}
