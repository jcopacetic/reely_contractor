import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Public marketing profile (linktree-style), reely.io/c/[slug]. The PROFILE module (next) wires the safe-
 * subset read (`profile.get-public`) — returns {display_name, headline, bio, category labels, avatar, links,
 * contracts_completed, hours_logged} only when is_public; a non-public slug 404s. Placeholder until then.
 */
export default async function PublicProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!slug) return notFound()

  return (
    <main className="mx-auto max-w-md px-6 py-20 text-center">
      <div className="mx-auto mb-4 size-20 rounded-full bg-muted" />
      <h1 className="font-display text-2xl font-bold tracking-tight">@{slug}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Public contractor profiles arrive with the profile module.</p>
    </main>
  )
}
