'use client'

import { useState, useTransition } from 'react'
import { Bell, Mail, Eye, Globe, Lock, Download, PauseCircle, Loader2, Check } from 'lucide-react'
import { setNotificationPrefAction, setEmailGlobalAction, setSearchableAction, setPublicAction, setAvailabilityAction } from '@/app/contractor/actions'

type CategoryPrefs = Record<string, { inApp?: boolean; email?: boolean }>

const CATEGORIES = [
  { key: 'work', label: 'Work & ceremonies', desc: 'Stand-ups, sprints, blockers, change requests, charters', inAppLocked: false },
  { key: 'hire', label: 'Hire requests', desc: 'New leads from your public profile', inAppLocked: false },
  { key: 'billing', label: 'Billing & payouts', desc: 'Charges, disputes, and account standing', inAppLocked: true },
] as const

function Switch({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${on ? 'bg-primary' : 'bg-muted-foreground/30'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span className={`inline-block size-4 rounded-full bg-white transition ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

function Section({ icon: Icon, title, children }: { icon: typeof Bell; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold"><Icon className="size-4 text-muted-foreground" /> {title}</h2>
      {children}
    </section>
  )
}

/** The interactive settings: notification matrix, visibility, and account-state. Each toggle saves on change. */
export function SettingsControls({
  initial,
}: {
  initial: { emailUnsubscribed: boolean; categories: CategoryPrefs; isPublic: boolean; searchable: boolean; hasSlug: boolean }
}) {
  const [, start] = useTransition()
  const [emailOn, setEmailOn] = useState(!initial.emailUnsubscribed)
  const [prefs, setPrefs] = useState<CategoryPrefs>(initial.categories)
  const [searchable, setSearchable] = useState(initial.searchable)
  const [isPublic, setIsPublic] = useState(initial.isPublic)
  const [paused, setPaused] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const inAppOn = (key: string, locked: boolean) => locked || prefs[key]?.inApp !== false
  const emailColOn = (key: string) => emailOn && prefs[key]?.email !== false

  function setChannel(key: string, channel: 'inApp' | 'email', on: boolean) {
    setPrefs((p) => ({ ...p, [key]: { ...p[key], [channel]: on } }))
    start(async () => { await setNotificationPrefAction(key, channel, on) })
  }
  function toggleEmail(on: boolean) {
    setEmailOn(on)
    start(async () => { await setEmailGlobalAction(!on) })
  }
  function toggleSearchable(on: boolean) {
    setSearchable(on)
    start(async () => { await setSearchableAction(on) })
  }
  function pauseProfile() {
    setMsg(null)
    start(async () => {
      await setPublicAction(false)
      await setAvailabilityAction({ acceptingWork: false })
      setIsPublic(false)
      setPaused(true)
      setMsg('Your profile is private and you’re marked as not accepting work.')
    })
  }

  return (
    <div className="space-y-5">
      <Section icon={Bell} title="Notifications">
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
          <div className="flex items-center gap-2 text-sm"><Mail className="size-4 text-muted-foreground" /> Email notifications</div>
          <Switch on={emailOn} onChange={toggleEmail} />
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Category</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><Bell className="size-3" /> In-app</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="size-3" /> Email</span>
          {CATEGORIES.map((c) => (
            <div key={c.key} className="contents">
              <div className="border-t border-border/60 py-2.5">
                <p className="font-medium">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.desc}</p>
              </div>
              <div className="border-t border-border/60 py-2.5" title={c.inAppLocked ? 'Always on — these are important account messages' : undefined}>
                {c.inAppLocked ? <Lock className="size-4 text-muted-foreground/60" /> : <Switch on={inAppOn(c.key, false)} onChange={(v) => setChannel(c.key, 'inApp', v)} />}
              </div>
              <div className="border-t border-border/60 py-2.5">
                <Switch on={emailColOn(c.key)} disabled={!emailOn} onChange={(v) => setChannel(c.key, 'email', v)} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Billing alerts always show in-app — they’re important account messages.</p>
      </Section>

      <Section icon={Eye} title="Profile visibility">
        <div className="flex items-center justify-between gap-3 py-1.5">
          <div className="text-sm">
            <p className="flex items-center gap-1.5 font-medium">{isPublic ? <Globe className="size-4 text-emerald-600" /> : <Lock className="size-4 text-muted-foreground" />} {isPublic ? 'Public' : 'Private'}</p>
            <p className="text-xs text-muted-foreground">{isPublic ? 'Anyone with the link can see your profile.' : 'Your profile is hidden. Publish it from your profile editor.'}</p>
          </div>
        </div>
        {isPublic && (
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <div className="text-sm">
              <p className="font-medium">List in search</p>
              <p className="text-xs text-muted-foreground">When off, your profile stays reachable by link but won’t appear in the sitemap or search.</p>
            </div>
            <Switch on={searchable} onChange={toggleSearchable} />
          </div>
        )}
      </Section>

      <Section icon={PauseCircle} title="Account">
        <div className="flex flex-wrap items-center gap-2">
          <a href="/contractor/settings/export" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"><Download className="size-4" /> Export my data</a>
          {!paused && isPublic && (
            <button type="button" onClick={pauseProfile} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"><PauseCircle className="size-4" /> Pause my profile</button>
          )}
        </div>
        {msg && <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-600"><Check className="size-4" /> {msg}</p>}
        <p className="mt-3 text-xs text-muted-foreground">Need to leave the platform entirely? Email <a href="mailto:jonathan@khaoticdigital.com" className="text-primary hover:underline">support</a> and we’ll close your account.</p>
      </Section>
    </div>
  )
}
