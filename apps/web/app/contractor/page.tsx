import { redirect } from 'next/navigation'
import { apiQuery } from '@/lib/api'
import { ContractorHeader } from '@/components/contractor-header'
import { Feed, type FeedPost } from '@/components/feed'

export const dynamic = 'force-dynamic'

type Own = { profile: { onboarded: boolean; displayName: string; avatarUrl: string | null } | null }

// The club dashboard = the social feed. Middleware gates this to vetted contractors; here we gate on
// onboarding completion (vetted-but-not-onboarded → the setup flow).
export default async function ClubDashboard() {
  const own = await apiQuery<Own>('profile.getOwn').catch(() => ({ profile: null }) as Own)
  if (!own.profile?.onboarded) redirect('/contractor/onboarding')

  const posts = await apiQuery<FeedPost[]>('feed.list').catch(() => [] as FeedPost[])

  return (
    <>
      <ContractorHeader active="feed" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <Feed initial={posts} me={{ displayName: own.profile.displayName, avatarUrl: own.profile.avatarUrl }} />
      </main>
    </>
  )
}
