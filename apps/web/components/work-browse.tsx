'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Filter } from 'lucide-react'
import { loadListingsAction } from '@/app/contractor/actions'

type Listing = {
  id: string
  title: string
  description: string
  categoryIds: string[]
  budgetType: 'hourly' | 'fixed'
  budgetAmount: number | null
  status: string
  createdAt: string
  bidCount: number
  boardPartRef: string | null
}
type Category = { id: string; name: string; slug: string }

export function budgetLabel(t: 'hourly' | 'fixed', amt: number | null): string {
  if (amt == null) return t === 'hourly' ? 'Hourly' : 'Fixed'
  const n = amt.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return t === 'hourly' ? `$${n}/hr` : `$${n} fixed`
}
function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  const d = Math.floor(s / 86400)
  if (d >= 1) return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString()
  const h = Math.floor(s / 3600)
  if (h >= 1) return `${h}h ago`
  return `${Math.floor(s / 60)}m ago`
}

export function WorkBrowse({ initial, categories, myCategoryIds }: { initial: Listing[]; categories: Category[]; myCategoryIds: string[] }) {
  const [listings, setListings] = useState<Listing[]>(initial)
  const [selCats, setSelCats] = useState<Set<string>>(new Set())
  const [budget, setBudget] = useState<'all' | 'hourly' | 'fixed'>('all')
  const [matchMine, setMatchMine] = useState(false)
  const [pending, start] = useTransition()
  const catName = new Map(categories.map((c) => [c.id, c.name]))

  function refetch(next: { cats?: Set<string>; budget?: 'all' | 'hourly' | 'fixed'; matchMine?: boolean }) {
    const cats = next.cats ?? selCats
    const b = next.budget ?? budget
    const mine = next.matchMine ?? matchMine
    const categoryIds = mine ? myCategoryIds : [...cats]
    start(async () => {
      setListings(await loadListingsAction({ categoryIds: categoryIds.length ? categoryIds : undefined, budgetType: b === 'all' ? undefined : b }))
    })
  }

  const toggleCat = (id: string) => {
    const n = new Set(selCats)
    n.has(id) ? n.delete(id) : n.add(id)
    setSelCats(n)
    if (!matchMine) refetch({ cats: n })
  }
  const setBudgetFilter = (b: 'all' | 'hourly' | 'fixed') => { setBudget(b); refetch({ budget: b }) }
  const toggleMine = () => { const v = !matchMine; setMatchMine(v); refetch({ matchMine: v }) }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">Find work</h1>
        <Link href="/contractor/work/new" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">
          <Plus className="size-4" /> Post a job
        </Link>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Filter className="size-3.5" /> Filters</div>
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'hourly', 'fixed'] as const).map((b) => (
            <button key={b} onClick={() => setBudgetFilter(b)} className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${budget === b ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>{b === 'all' ? 'Any budget' : b}</button>
          ))}
          {myCategoryIds.length > 0 && (
            <button onClick={toggleMine} className={`rounded-full px-3 py-1 text-xs font-medium transition ${matchMine ? 'bg-primary text-primary-foreground' : 'border border-primary/40 text-primary hover:bg-primary/10'}`}>Matches my skills</button>
          )}
        </div>
        {!matchMine && categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button key={c.id} onClick={() => toggleCat(c.id)} className={`rounded-full border px-2.5 py-0.5 text-xs transition ${selCats.has(c.id) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>{c.name}</button>
            ))}
          </div>
        )}
      </div>

      {pending && <p className="text-center text-xs text-muted-foreground"><Loader2 className="inline size-3 animate-spin" /> Updating…</p>}
      {listings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">No open jobs match — try widening your filters, or check back soon.</div>
      ) : (
        <div className="space-y-3">
          {listings.map((l) => (
            <Link key={l.id} href={`/contractor/work/${l.id}`} className="block rounded-xl border border-border bg-card p-4 transition hover:border-primary/50">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-base font-semibold">{l.title}</h2>
                <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{budgetLabel(l.budgetType, l.budgetAmount)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{l.description}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {l.categoryIds.slice(0, 4).map((id) => catName.get(id) && <span key={id} className="rounded-full border border-border px-2 py-0.5">{catName.get(id)}</span>)}
                <span className="ml-auto">{l.bidCount} bid{l.bidCount === 1 ? '' : 's'} · {timeAgo(l.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
