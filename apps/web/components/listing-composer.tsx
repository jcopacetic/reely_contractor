'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check } from 'lucide-react'
import { createListingAction } from '@/app/contractor/actions'

type Category = { id: string; name: string; slug: string }
const inputCls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary'

/** Post a native job listing (a vetted contractor subcontracting work). Board posts via the provider surface. */
export function ListingComposer({ categories }: { categories: Category[] }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [cats, setCats] = useState<Set<string>>(new Set())
  const [budgetType, setBudgetType] = useState<'hourly' | 'fixed'>('hourly')
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const toggle = (id: string) => { const n = new Set(cats); n.has(id) ? n.delete(id) : n.add(id); setCats(n) }

  function submit() {
    setErr(null)
    if (!title.trim()) return setErr('Add a title.')
    if (!description.trim()) return setErr('Describe the work.')
    start(async () => {
      const r = await createListingAction({ title: title.trim(), description: description.trim(), categoryIds: [...cats], budgetType, budgetAmount: amount ? Number(amount) : null })
      if ('error' in r) setErr(r.error)
      else router.push(`/contractor/work/${r.listingId}`)
    })
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold tracking-tight">Post a job</h1>
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Build a Next.js landing page" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">The brief</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} maxLength={5000} placeholder="What needs doing, scope, timeline, must-haves…" className={`${inputCls} resize-y`} />
        </label>
        <div>
          <span className="mb-1.5 block text-sm font-medium">Skills</span>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button key={c.id} type="button" onClick={() => toggle(c.id)} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition ${cats.has(c.id) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                {cats.has(c.id) && <Check className="size-3" />} {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Budget</span>
            <select value={budgetType} onChange={(e) => setBudgetType(e.target.value as 'hourly' | 'fixed')} className={`${inputCls} h-9 w-40 py-0`}>
              <option value="hourly">Hourly</option>
              <option value="fixed">Fixed price</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{budgetType === 'hourly' ? 'Rate ($/hr, optional)' : 'Price ($, optional)'}</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="—" className={`${inputCls} h-9 w-40 py-0`} />
          </label>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <button onClick={submit} disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null} Post job
        </button>
      </div>
    </div>
  )
}
