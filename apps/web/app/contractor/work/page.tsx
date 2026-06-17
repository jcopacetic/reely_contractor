import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'
import { apiQuery } from '@/lib/api'
import { WorkBrowse } from '@/components/work-browse'

export const dynamic = 'force-dynamic'

type Listing = {
  id: string; title: string; description: string; categoryIds: string[]
  budgetType: 'hourly' | 'fixed'; budgetAmount: number | null; status: string; createdAt: string; bidCount: number; boardPartRef: string | null; invited: boolean
}
type Category = { id: string; name: string; slug: string }

const money = (t: string, a: number | null) => (a == null ? 'Open budget' : t === 'hourly' ? `$${a}/hr` : `$${a} fixed`)

// Find Work — the vetted-only job feed. Middleware gates /contractor/** to vetted contractors.
export default async function WorkPage() {
  const [listings, invited, categories, myCategoryIds] = await Promise.all([
    apiQuery<Listing[]>('jobFeed.list').catch(() => [] as Listing[]),
    apiQuery<Listing[]>('jobFeed.invited').catch(() => [] as Listing[]),
    apiQuery<Category[]>('profile.listCategories').catch(() => [] as Category[]),
    apiQuery<string[]>('jobFeed.myCategories').catch(() => [] as string[]),
  ])
  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-6">
        {invited.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Invited to you<span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{invited.length}</span></h2>
            <ul className="space-y-2">
              {invited.map((l) => (
                <li key={l.id}>
                  <Link href={`/contractor/work/${l.id}`} className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3.5 transition hover:border-primary/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{l.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{money(l.budgetType, l.budgetAmount)} · {l.bidCount} bid{l.bidCount === 1 ? '' : 's'}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Invited</span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <WorkBrowse initial={listings} categories={categories} myCategoryIds={myCategoryIds} />
      </main>
    </>
  )
}
