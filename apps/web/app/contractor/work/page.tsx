import { apiQuery } from '@/lib/api'
import { WorkBrowse } from '@/components/work-browse'

export const dynamic = 'force-dynamic'

type Listing = {
  id: string; title: string; description: string; categoryIds: string[]
  budgetType: 'hourly' | 'fixed'; budgetAmount: number | null; status: string; createdAt: string; bidCount: number; boardPartRef: string | null
}
type Category = { id: string; name: string; slug: string }

// Find Work — the vetted-only job feed. Middleware gates /contractor/** to vetted contractors.
export default async function WorkPage() {
  const [listings, categories, myCategoryIds] = await Promise.all([
    apiQuery<Listing[]>('jobFeed.list').catch(() => [] as Listing[]),
    apiQuery<Category[]>('profile.listCategories').catch(() => [] as Category[]),
    apiQuery<string[]>('jobFeed.myCategories').catch(() => [] as string[]),
  ])
  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <WorkBrowse initial={listings} categories={categories} myCategoryIds={myCategoryIds} />
      </main>
    </>
  )
}
