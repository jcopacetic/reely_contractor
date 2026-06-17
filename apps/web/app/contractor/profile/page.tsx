import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { apiQuery } from '@/lib/api'
import { ProfileForm, type ProfileInitial } from '@/components/profile-form'
import type { Block } from '@/lib/profile-blocks'

export const dynamic = 'force-dynamic'

type Own = {
  profile:
    | { firstName: string; lastName: string; company: string | null; position: string | null; headline: string | null; bio: string | null; avatarUrl: string | null; blocks: Block[]; categoryIds: string[]; isPublic: boolean; publicSlug: string | null; onboarded: boolean; acceptingWork: boolean; capacityHours: number | null; awayUntil: string | null; ratePublic: number | null; location: string | null; vetted: boolean }
    | null
  requiredDocs: string[]
  acceptedDocs: string[]
}
type Cat = { id: string; name: string; slug: string }

export default async function ProfileEditorPage() {
  const [own, categories] = await Promise.all([apiQuery<Own>('profile.getOwn'), apiQuery<Cat[]>('profile.listCategories')])

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
        ratePublic: own.profile.ratePublic,
        location: own.profile.location,
        vetted: own.profile.vetted,
      }
    : null

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/contractor" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> The Club</Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight">Edit profile</h1>
        <Link href="/contractor/extension" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">Timer extension</Link>
      </div>
      <ProfileForm mode="edit" initial={initial} categories={categories} acceptedDocs={own.acceptedDocs} requiredDocs={own.requiredDocs} />
    </main>
  )
}
