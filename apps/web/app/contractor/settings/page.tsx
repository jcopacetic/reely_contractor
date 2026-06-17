import Link from 'next/link'
import { UserCircle, Banknote, ChevronRight, Clock } from 'lucide-react'
import { apiQuery } from '@/lib/api'
import { SettingsControls } from '@/components/settings-controls'

export const dynamic = 'force-dynamic'

type Prefs = { emailUnsubscribed: boolean; categories: Record<string, { inApp?: boolean; email?: boolean }> }
type Own = { profile: { isPublic: boolean; searchable: boolean; publicSlug: string | null; displayName: string } | null }

export default async function SettingsPage() {
  const [prefs, own] = await Promise.all([
    apiQuery<Prefs>('notifications.prefs', {}).catch(() => ({ emailUnsubscribed: false, categories: {} as Prefs['categories'] })),
    apiQuery<Own>('profile.getOwn', {}).catch(() => ({ profile: null })),
  ])
  const p = own.profile

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-1 font-display text-2xl font-bold tracking-tight">Settings</h1>
      <p className="mb-5 text-sm text-muted-foreground">Notifications, profile visibility, and your account.</p>

      {/* Links to the surfaces that own their own settings */}
      <div className="mb-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        <SettingLink href="/contractor/profile" icon={UserCircle} title="Profile & availability" desc="Your public profile, skills, rate, and whether you’re accepting work" />
        <SettingLink href="/contractor/payouts" icon={Banknote} title="Payouts & tax" desc="Stripe payout account, earnings, tax forms" />
        <SettingLink href="/contractor/extension" icon={Clock} title="Timer extension" desc="Device tokens for the time-tracking extension" />
      </div>

      <SettingsControls
        initial={{
          emailUnsubscribed: prefs.emailUnsubscribed,
          categories: prefs.categories,
          isPublic: p?.isPublic ?? false,
          searchable: p?.searchable ?? true,
          hasSlug: Boolean(p?.publicSlug),
        }}
      />
    </main>
  )
}

function SettingLink({ href, icon: Icon, title, desc }: { href: string; icon: typeof UserCircle; title: string; desc: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/50">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{desc}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}
