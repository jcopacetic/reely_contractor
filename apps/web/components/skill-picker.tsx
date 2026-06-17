'use client'

import { useMemo, useState, useTransition } from 'react'
import { Search, Check, X, Plus, Loader2 } from 'lucide-react'
import { requestSkillAction } from '@/app/contractor/actions'

type Category = { id: string; name: string; slug: string }

/** Searchable skill picker — type to filter the (large, controlled) skill vocabulary, click to add. Selected
 *  skills show as removable chips. If a skill genuinely isn't there, "Request it" submits it for admin review
 *  (the vocab is the shared Board job-match key, so additions are moderated, not free-text). */
export function SkillPicker({ categories, selected, onToggle }: { categories: Category[]; selected: Set<string>; onToggle: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [requested, setRequested] = useState<string[]>([])
  const [reqMsg, setReqMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const needle = q.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!needle) return [] as Category[]
    return categories.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 12)
  }, [categories, needle])
  const exact = categories.some((c) => c.name.toLowerCase() === needle)

  function request() {
    const name = q.trim()
    if (!name) return
    setReqMsg(null)
    start(async () => {
      const r = await requestSkillAction(name)
      if (r.error) { setReqMsg('Could not send that request — try again.'); return }
      if (r.status === 'exists') { setReqMsg(`“${name}” already exists — search for it above.`); return }
      setRequested((xs) => [...xs, name])
      setReqMsg(r.status === 'already_pending' ? `“${name}” is already awaiting review.` : `Requested “${name}” — we’ll review and add it.`)
      setQ('')
    })
  }

  const chosen = [...selected].map((id) => byId.get(id)).filter(Boolean) as Category[]

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setReqMsg(null) }}
          placeholder="Search skills — e.g. React, SEO, DevOps…"
          className="h-9 w-full rounded-md border border-border bg-card pl-8 pr-3 text-sm outline-none focus:border-primary"
        />
      </div>

      {needle && (
        <div className="mt-1.5 rounded-md border border-border bg-card p-1">
          {matches.length > 0 ? (
            <ul className="max-h-56 overflow-auto">
              {matches.map((c) => {
                const on = selected.has(c.id)
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => onToggle(c.id)} className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm hover:bg-muted">
                      <span className={`grid size-4 place-items-center rounded border ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{on && <Check className="size-3" />}</span>
                      {c.name}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-2.5 py-1.5 text-sm text-muted-foreground">No matches.</p>
          )}
          {!exact && (
            <button type="button" onClick={request} disabled={pending} className="mt-1 flex w-full items-center gap-1.5 rounded px-2.5 py-1.5 text-left text-sm text-primary hover:bg-primary/5 disabled:opacity-60">
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Can’t find it? Request “{q.trim()}”
            </button>
          )}
        </div>
      )}

      {reqMsg && <p className="mt-1.5 text-xs text-muted-foreground">{reqMsg}</p>}

      {chosen.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chosen.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 py-1 pl-3 pr-1 text-sm text-primary">
              {c.name}
              <button type="button" onClick={() => onToggle(c.id)} className="grid size-5 place-items-center rounded-full hover:bg-primary/15"><X className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
      {requested.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {requested.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground">{n} · pending review</span>
          ))}
        </div>
      )}
    </div>
  )
}
