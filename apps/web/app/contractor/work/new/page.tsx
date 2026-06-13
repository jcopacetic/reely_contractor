import { apiQuery } from '@/lib/api'
import { ListingComposer } from '@/components/listing-composer'

export const dynamic = 'force-dynamic'

type Category = { id: string; name: string; slug: string }

export default async function NewListingPage() {
  const categories = await apiQuery<Category[]>('profile.listCategories').catch(() => [] as Category[])
  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <ListingComposer categories={categories} />
      </main>
    </>
  )
}
