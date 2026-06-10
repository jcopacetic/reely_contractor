import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { apiQuery } from '@/lib/api'
import { ProfileForm, type ProfileInitial } from '@/components/profile-form'

export const dynamic = 'force-dynamic'

type Own = {
  profile:
    | { displayName: string; headline: string | null; bio: string | null; links: { label: string; url: string }[]; categoryIds: string[]; isPublic: boolean; publicSlug: string | null; onboarded: boolean }
    | null
  requiredDocs: string[]
  acceptedDocs: string[]
}
type Cat = { id: string; name: string; slug: string }

export default async function ProfileEditorPage() {
  const [own, categories] = await Promise.all([apiQuery<Own>('profile.getOwn'), apiQuery<Cat[]>('profile.listCategories')])

  const initial: ProfileInitial = own.profile
    ? {
        displayName: own.profile.displayName,
        headline: own.profile.headline,
        bio: own.profile.bio,
        links: own.profile.links,
        categoryIds: own.profile.categoryIds,
        isPublic: own.profile.isPublic,
        publicSlug: own.profile.publicSlug,
      }
    : null

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/contractor" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> The Club</Link>
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight">Edit profile</h1>
      <ProfileForm mode="edit" initial={initial} categories={categories} acceptedDocs={own.acceptedDocs} requiredDocs={own.requiredDocs} />
    </main>
  )
}
