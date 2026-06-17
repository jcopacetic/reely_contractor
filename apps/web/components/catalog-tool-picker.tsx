'use client'

import { useState, useRef, useTransition } from 'react'
import { Search, X, Plus, Loader2 } from 'lucide-react'
import { searchCatalogToolsAction, type CatalogTool } from '@/app/contractor/actions'

const favicon = (domain: string | null) => (domain ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}` : null)

/** "Tools I know" picker — search the catalog's companies (Stripe, HubSpot, …) and add them as chips. The
 *  selected refs are catalog SaaS-org snapshots; they link to the catalog company page on the public profile. */
export function CatalogToolPicker({ value, onChange }: { value: CatalogTool[]; onChange: (next: CatalogTool[]) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CatalogTool[]>([])
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onType(next: string) {
    setQ(next)
    if (timer.current) clearTimeout(timer.current)
    if (!next.trim()) { setResults([]); setOpen(false); return }
    timer.current = setTimeout(() => {
      start(async () => {
        const hits = await searchCatalogToolsAction(next.trim())
        setResults(hits)
        setOpen(true)
      })
    }, 250)
  }

  function add(t: CatalogTool) {
    if (value.length >= 30 || value.some((v) => v.id === t.id)) return
    onChange([...value, t])
    setQ(''); setResults([]); setOpen(false)
  }
  const remove = (id: string) => onChange(value.filter((v) => v.id !== id))

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search tools you know — Stripe, HubSpot, Figma…"
          className="h-9 w-full rounded-md border border-border bg-card pl-8 pr-8 text-sm outline-none focus:border-primary"
        />
        {pending && <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        {open && results.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card shadow-lg">
            {results.map((t) => {
              const taken = value.some((v) => v.id === t.id)
              const fav = favicon(t.domain)
              return (
                <li key={t.id}>
                  <button type="button" disabled={taken} onClick={() => add(t)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50">
                    {fav ? <img src={fav} alt="" className="size-4 rounded-sm" /> : <span className="grid size-4 place-items-center rounded-sm bg-muted text-[9px]">{t.name.charAt(0)}</span>}
                    <span className="flex-1 truncate">{t.name}</span>
                    {taken ? <span className="text-xs text-muted-foreground">Added</span> : <Plus className="size-3.5 text-muted-foreground" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((t) => {
            const fav = favicon(t.domain)
            return (
              <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-2 pr-1 text-sm">
                {fav ? <img src={fav} alt="" className="size-4 rounded-sm" /> : null}
                {t.name}
                <button type="button" onClick={() => remove(t.id)} className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"><X className="size-3" /></button>
              </span>
            )
          })}
        </div>
      )}
      {q.trim() && open && !pending && results.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">No catalog match for “{q.trim()}”.</p>
      )}
    </div>
  )
}
