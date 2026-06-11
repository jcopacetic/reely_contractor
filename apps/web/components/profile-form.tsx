'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2, Check, ExternalLink, Globe } from 'lucide-react'
import { saveProfileAction, checkSlugAction, setPublicAction, acceptDocAction, completeOnboardingAction } from '@/app/contractor/actions'

type Link = { label: string; url: string }
type Category = { id: string; name: string; slug: string }
export type ProfileInitial = {
  displayName: string
  headline: string | null
  bio: string | null
  links: Link[]
  categoryIds: string[]
  isPublic: boolean
  publicSlug: string | null
} | null

/** Shared profile editor + onboarding setup. `mode='onboarding'` adds the agreement gate + Finish button. */
export function ProfileForm({
  initial,
  categories,
  acceptedDocs,
  requiredDocs,
  mode,
}: {
  initial: ProfileInitial
  categories: Category[]
  acceptedDocs: string[]
  requiredDocs: string[]
  mode: 'onboarding' | 'edit'
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [headline, setHeadline] = useState(initial?.headline ?? '')
  const [bio, setBio] = useState(initial?.bio ?? '')
  const [links, setLinks] = useState<Link[]>(initial?.links ?? [])
  const [cats, setCats] = useState<Set<string>>(new Set(initial?.categoryIds ?? []))
  const [slug, setSlug] = useState(initial?.publicSlug ?? '')
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? false)
  const [agreed, setAgreed] = useState(requiredDocs.every((d) => acceptedDocs.includes(d)))
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const toggleCat = (id: string) => setCats((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const setLink = (i: number, k: keyof Link, v: string) => setLinks((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  function save() {
    setErr(null); setMsg(null)
    start(async () => {
      const r = await saveProfileAction({
        displayName: displayName.trim(),
        headline: headline.trim() || null,
        bio: bio.trim() || null,
        links: links.filter((l) => l.label.trim() && l.url.trim()),
        categoryIds: [...cats],
        publicSlug: slug.trim() || null,
      })
      if (r.error) setErr(r.error === 'slug_taken' ? 'That URL is taken — pick another.' : r.error === 'invalid_slug' ? 'URL: 3–40 lowercase letters, numbers, and dashes.' : r.error)
      else setMsg('Saved.')
    })
  }

  // Pure availability check — does NOT save or publish. The slug persists when you hit Save.
  function checkSlug() {
    setErr(null); setMsg(null)
    start(async () => {
      const r = await checkSlugAction(slug.trim())
      if (r.error) setErr(r.error)
      else if (!r.available) setErr(r.reason === 'taken' ? 'That URL is taken — pick another.' : 'URL: 3–40 lowercase letters, numbers, and dashes.')
      else setMsg('That URL is available — it’s saved when you hit Save.')
    })
  }

  function togglePublic() {
    setErr(null)
    start(async () => {
      const r = await setPublicAction(!isPublic)
      if (r.error) setErr(r.error === 'slug_required' ? 'Set a URL and hit Save first, then publish.' : r.error)
      else setIsPublic(!isPublic)
    })
  }

  function toggleAgree() {
    if (agreed) return
    start(async () => {
      const r = await acceptDocAction(requiredDocs[0] ?? 'contractor-agreement')
      if (!r.error) setAgreed(true)
    })
  }

  function finish() {
    setErr(null)
    start(async () => {
      await save()
      const r = await completeOnboardingAction()
      if (r.error) {
        const labels = (r.missing ?? []).map((m) => (m === 'display_name' ? 'a name' : m === 'categories' ? 'at least one skill' : 'the agreement'))
        setErr(`Still needed: ${labels.join(', ')}.`)
      } else router.push('/contractor')
    })
  }

  return (
    <div className="space-y-8">
      <Section title="Basics">
        <Field label="Display name">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} placeholder="Your name or studio" />
        </Field>
        <Field label="Headline">
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} className={inputCls} placeholder="e.g. Full-stack engineer · HubSpot specialist" />
        </Field>
        <Field label="Bio">
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} className={`${inputCls} resize-y`} placeholder="A short intro for your public profile." />
        </Field>
      </Section>

      <Section title="Skills" hint="What you do. These match you to fitting job briefs — and show on your profile.">
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const on = cats.has(c.id)
            return (
              <button key={c.id} type="button" onClick={() => toggleCat(c.id)} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                {on && <Check className="size-3" />} {c.name}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Links" hint="Your linktree — portfolio, socials, scheduling. Up to 10.">
        <div className="space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input value={l.label} onChange={(e) => setLink(i, 'label', e.target.value)} placeholder="Label" className={`${inputCls} w-40`} />
              <input value={l.url} onChange={(e) => setLink(i, 'url', e.target.value)} placeholder="https://…" className={`${inputCls} flex-1`} />
              <button type="button" onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))} className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted"><Trash2 className="size-4" /></button>
            </div>
          ))}
          {links.length < 10 && (
            <button type="button" onClick={() => setLinks((l) => [...l, { label: '', url: '' }])} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Plus className="size-4" /> Add link</button>
          )}
        </div>
      </Section>

      <Section title="Public URL" hint="Your shareable profile at reely.io/pro/your-handle.">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">reely.io/pro/</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="your-handle" className={`${inputCls} w-48`} />
          <button type="button" onClick={checkSlug} disabled={pending || !slug.trim()} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-60">Check</button>
          {initial?.publicSlug && (
            <a href={`/pro/${initial.publicSlug}`} target="_blank" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">View <ExternalLink className="size-3" /></a>
          )}
        </div>
        <button type="button" onClick={togglePublic} disabled={pending} className={`mt-3 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${isPublic ? 'bg-emerald-500/15 text-emerald-700' : 'border border-border text-muted-foreground hover:bg-muted'}`}>
          <Globe className="size-4" /> {isPublic ? 'Public — visible to anyone' : 'Make profile public'}
        </button>
      </Section>

      {mode === 'onboarding' && (
        <Section title="Agreement" hint="We need this signed before you can take on contracts.">
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={agreed} onChange={toggleAgree} className="mt-0.5 size-4" />
            <span>I have read and agree to the <a href="#" className="text-primary hover:underline">Reely Contractor Agreement</a>.</span>
          </label>
        </Section>
      )}

      {err && <p className="text-sm text-destructive">{err}</p>}
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}

      <div className="flex items-center gap-3 border-t border-border pt-5">
        <button type="button" onClick={save} disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-60">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null} Save
        </button>
        {mode === 'onboarding' && (
          <button type="button" onClick={finish} disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Finish onboarding
          </button>
        )}
      </div>
    </div>
  )
}

const inputCls = 'h-9 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-primary'

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <div className="[&_input]:w-full [&_textarea]:w-full">{children}</div>
    </label>
  )
}
