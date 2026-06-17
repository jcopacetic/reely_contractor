'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, ExternalLink, Globe } from 'lucide-react'
import { saveProfileAction, checkSlugAction, setPublicAction, setAvailabilityAction, acceptDocAction, completeOnboardingAction } from '@/app/contractor/actions'
import { ProfileBlocksEditor } from '@/components/profile-blocks-editor'
import { AvatarUploader } from '@/components/avatar-uploader'
import { CatalogToolPicker } from '@/components/catalog-tool-picker'
import { cleanBlocks, type Block } from '@/lib/profile-blocks'

type Category = { id: string; name: string; slug: string }
export type IndustryRef = { slug: string; label: string }
export type IndustryGroup = { slug: string; label: string; acutes: IndustryRef[] }
export type ToolRef = { id: string; name: string; slug: string; domain: string | null }
export type ProfileInitial = {
  firstName: string
  lastName: string
  company: string | null
  position: string | null
  headline: string | null
  bio: string | null
  avatarUrl: string | null
  blocks: Block[]
  categoryIds: string[]
  isPublic: boolean
  publicSlug: string | null
  acceptingWork: boolean
  capacityHours: number | null
  awayUntil: string | null
  ratePublic: number | null
  location: string | null
  industries: IndustryRef[]
  tools: ToolRef[]
  vetted: boolean
} | null

/** Shared profile editor + onboarding setup. `mode='onboarding'` adds the agreement gate + Finish button. */
export function ProfileForm({
  initial,
  categories,
  industryTree,
  acceptedDocs,
  requiredDocs,
  mode,
}: {
  initial: ProfileInitial
  categories: Category[]
  industryTree: IndustryGroup[]
  acceptedDocs: string[]
  requiredDocs: string[]
  mode: 'onboarding' | 'edit'
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [firstName, setFirstName] = useState(initial?.firstName ?? '')
  const [lastName, setLastName] = useState(initial?.lastName ?? '')
  const [company, setCompany] = useState(initial?.company ?? '')
  const [position, setPosition] = useState(initial?.position ?? '')
  const [headline, setHeadline] = useState(initial?.headline ?? '')
  const [bio, setBio] = useState(initial?.bio ?? '')
  const [blocks, setBlocks] = useState<Block[]>(initial?.blocks ?? [])
  const [cats, setCats] = useState<Set<string>>(new Set(initial?.categoryIds ?? []))
  const [industries, setIndustries] = useState<IndustryRef[]>(initial?.industries ?? [])
  const [tools, setTools] = useState<ToolRef[]>(initial?.tools ?? [])
  const [slug, setSlug] = useState(initial?.publicSlug ?? '')
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? false)
  const [acceptingWork, setAcceptingWork] = useState(initial?.acceptingWork ?? true)
  const [capacityHours, setCapacityHours] = useState(initial?.capacityHours != null ? String(initial.capacityHours) : '')
  const [awayUntil, setAwayUntil] = useState(initial?.awayUntil ? initial.awayUntil.slice(0, 10) : '')
  const [ratePublic, setRatePublic] = useState(initial?.ratePublic != null ? String(initial.ratePublic) : '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [agreed, setAgreed] = useState(requiredDocs.every((d) => acceptedDocs.includes(d)))
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const toggleCat = (id: string) => setCats((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const industrySel = new Set(industries.map((i) => i.slug))
  const toggleIndustry = (ref: IndustryRef) => setIndustries((xs) => (industrySel.has(ref.slug) ? xs.filter((i) => i.slug !== ref.slug) : xs.length >= 20 ? xs : [...xs, ref]))

  function save() {
    setErr(null); setMsg(null)
    start(async () => {
      const r = await saveProfileAction({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        company: company.trim() || null,
        position: position.trim() || null,
        headline: headline.trim() || null,
        bio: bio.trim() || null,
        blocks: cleanBlocks(blocks),
        categoryIds: [...cats],
        publicSlug: slug.trim() || null,
        ratePublic: rateValue(ratePublic),
        location: location.trim() || null,
        industries,
        tools,
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
    setErr(null); setMsg(null)
    start(async () => {
      // Going public: persist the profile (incl. the handle) first, then flip is_public — one click.
      if (!isPublic) {
        if (!slug.trim()) {
          setErr('Enter a public URL above first, then make your profile public.')
          return
        }
        const saved = await saveProfileAction({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          company: company.trim() || null,
          position: position.trim() || null,
          headline: headline.trim() || null,
          bio: bio.trim() || null,
          blocks: cleanBlocks(blocks),
          categoryIds: [...cats],
          publicSlug: slug.trim(),
          ratePublic: rateValue(ratePublic),
          location: location.trim() || null,
          industries,
          tools,
        })
        if (saved.error) {
          setErr(saved.error === 'slug_taken' ? 'That URL is taken — pick another.' : saved.error === 'invalid_slug' ? 'URL: 3–40 lowercase letters, numbers, and dashes.' : saved.error)
          return
        }
      }
      const r = await setPublicAction(!isPublic)
      if (r.error) setErr(r.error)
      else {
        setIsPublic(!isPublic)
        setMsg(!isPublic ? 'Your profile is public.' : 'Your profile is private.')
      }
    })
  }

  // Availability saves on its own path (the most-touched control shouldn't need a full profile Save).
  function saveAvailability() {
    setErr(null); setMsg(null)
    start(async () => {
      const cap = capacityHours.trim() ? Math.max(0, Math.min(168, Math.round(Number(capacityHours)))) : null
      const away = awayUntil ? new Date(`${awayUntil}T00:00:00.000Z`).toISOString() : null
      const r = await setAvailabilityAction({ acceptingWork, capacityHours: cap, awayUntil: away })
      if (r.error) setErr(r.error)
      else setMsg('Availability updated.')
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
        const labels = (r.missing ?? []).map((m) => (m === 'name' ? 'your first + last name' : m === 'categories' ? 'at least one skill' : 'the agreement'))
        setErr(`Still needed: ${labels.join(', ')}.`)
      } else router.push('/contractor')
    })
  }

  return (
    <div className="space-y-8">
      <Section title="Basics" hint="Your profile is YOU — an individual. Add a company + role if you have one; it shows as a detail, not your account name.">
        <div className="mb-5">
          <AvatarUploader initialUrl={initial?.avatarUrl ?? null} displayName={firstName || initial?.firstName} />
        </div>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="First name">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} placeholder="Jane" />
          </Field>
          <Field label="Last name">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} placeholder="Doe" />
          </Field>
          <Field label="Company (optional)">
            <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} placeholder="where you work / your studio" />
          </Field>
          <Field label="Position (optional)">
            <input value={position} onChange={(e) => setPosition(e.target.value)} className={inputCls} placeholder="e.g. Principal Engineer" />
          </Field>
        </div>
        <Field label="Headline">
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} className={inputCls} placeholder="e.g. Full-stack engineer · HubSpot specialist" />
        </Field>
        <Field label="Bio">
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} className={`${inputCls} resize-y`} placeholder="A short intro for your public profile." />
        </Field>
      </Section>

      <Section title="Availability" hint="Tell clients whether you can take on work — it shows as a status on your public profile.">
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={acceptingWork} onChange={(e) => setAcceptingWork(e.target.checked)} className="size-4" />
          <span>I’m accepting new work</span>
        </label>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Capacity (optional)</span>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={168} value={capacityHours} onChange={(e) => setCapacityHours(e.target.value)} className={`${inputCls} w-24`} placeholder="20" />
              <span className="text-sm text-muted-foreground">hrs / week</span>
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Away until (optional)</span>
            <input type="date" value={awayUntil} onChange={(e) => setAwayUntil(e.target.value)} className={inputCls} />
          </label>
        </div>
        <button type="button" onClick={saveAvailability} disabled={pending} className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-60">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null} Update availability
        </button>
        <div className="mt-5 flex flex-wrap items-end gap-4 border-t border-border/60 pt-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Public rate (optional)</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <input type="number" min={0} value={ratePublic} onChange={(e) => setRatePublic(e.target.value)} className={`${inputCls} w-24`} placeholder="125" />
              <span className="text-sm text-muted-foreground">/ hr</span>
            </div>
          </label>
          <label className="block flex-1">
            <span className="mb-1 block text-sm font-medium">Location (optional)</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. Amarillo, TX (CST)" />
          </label>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">Rate + location show in the “Request to hire” box on your public profile. Leave the rate blank for “Rate on request.” These save with the main Save below.</p>
        {initial?.vetted && <p className="mt-3 text-xs text-muted-foreground">You’re a <span className="font-medium text-primary">vetted contractor</span> — that badge shows on your public profile.</p>}
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

      <Section title="Industries" hint="The sectors you’ve worked in — drawn from the Reely catalog, so your profile lines up with how clients browse. Pick the ones that fit.">
        {industryTree.length === 0 ? (
          <p className="text-sm text-muted-foreground">Industry options are loading from the catalog — check back shortly.</p>
        ) : (
          <div className="space-y-3">
            {industryTree.map((g) => (
              <div key={g.slug}>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</p>
                <div className="flex flex-wrap gap-2">
                  {g.acutes.map((a) => {
                    const on = industrySel.has(a.slug)
                    return (
                      <button key={a.slug} type="button" onClick={() => toggleIndustry(a)} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                        {on && <Check className="size-3" />} {a.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {industries.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{industries.length} selected{industries.length >= 20 ? ' (max)' : ''}.</p>}
      </Section>

      <Section title="Tools I know" hint="The software you’re genuinely experienced with — search the Reely catalog and add what you actually use.">
        <CatalogToolPicker value={tools} onChange={setTools} />
      </Section>

      <Section title="Your page" hint="Build your public profile — stack blocks of links, text, images, and lists. Reorder them any way you like.">
        <ProfileBlocksEditor value={blocks} onChange={setBlocks} />
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

/** Parse the rate input to a positive integer or null (blank / non-numeric → null = "Rate on request"). */
function rateValue(raw: string): number | null {
  const n = Number(raw)
  return raw.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

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
