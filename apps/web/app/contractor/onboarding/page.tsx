import { redirect } from 'next/navigation'
import { apiQuery } from '@/lib/api'
import { ProfileForm, type ProfileInitial } from '@/components/profile-form'
import type { Block } from '@/lib/profile-blocks'

export const dynamic = 'force-dynamic'

type Own = {
  profile:
    | { firstName: string; lastName: string; company: string | null; position: string | null; headline: string | null; bio: string | null; avatarUrl: string | null; blocks: Block[]; categoryIds: string[]; isPublic: boolean; publicSlug: string | null; onboarded: boolean; acceptingWork: boolean; capacityHours: number | null; awayUntil: string | null; vetted: boolean }
    | null
  requiredDocs: string[]
  acceptedDocs: string[]
}
type Cat = { id: string; name: string; slug: string }

export default async function OnboardingPage() {
  const [own, categories] = await Promise.all([apiQuery<Own>('profile.getOwn'), apiQuery<Cat[]>('profile.listCategories')])
  if (own.profile?.onboarded) redirect('/contractor')

  const initial: ProfileInitial = own.profile
    ? {
        firstName: own.profile.firstName,
        lastName: own.profile.lastName,
        company: own.profile.company,
        position: own.profile.position,
        headline: own.profile.headline,
        bio: own.profile.bio,
        avatarUrl: own.profile.avatarUrl,
        blocks: own.profile.blocks,
        categoryIds: own.profile.categoryIds,
        isPublic: own.profile.isPublic,
        publicSlug: own.profile.publicSlug,
        acceptingWork: own.profile.acceptingWork,
        capacityHours: own.profile.capacityHours,
        awayUntil: own.profile.awayUntil,
        vetted: own.profile.vetted,
      }
    : null

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">Set up your club profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">A few things before you&apos;re in: your public profile, the skills you work in, and the contractor agreement.</p>
      </div>
      <ProfileForm mode="onboarding" initial={initial} categories={categories} acceptedDocs={own.acceptedDocs} requiredDocs={own.requiredDocs} />
    </main>
  )
}
