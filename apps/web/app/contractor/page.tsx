import Link from 'next/link'
import { Rss, MessagesSquare, Bell, Briefcase, FileText, Wallet, Lock } from 'lucide-react'

export const dynamic = 'force-dynamic'

// The club dashboard. Middleware gates this to role `contractor`. The social feed lands next; the work-loop
// surfaces (jobs/contracts/financial) are stubs until Phase 2.
const AREAS: { href: string; label: string; desc: string; Icon: typeof Rss; soon?: boolean }[] = [
  { href: '/contractor', label: 'Feed', desc: 'The club social feed — posts, milestones, follows.', Icon: Rss },
  { href: '/contractor/messages', label: 'Messages', desc: 'DM fellow contractors.', Icon: MessagesSquare },
  { href: '/contractor/notifications', label: 'Notifications', desc: 'Bids, contracts, club activity.', Icon: Bell },
  { href: '/contractor/jobs', label: 'Find Work', desc: 'Job briefs matched to your skills.', Icon: Briefcase, soon: true },
  { href: '/contractor/contracts', label: 'Contracts', desc: 'Your bids and active contracts.', Icon: FileText, soon: true },
  { href: '/contractor/financial', label: 'Financial', desc: 'Payouts, billing, time.', Icon: Wallet, soon: true },
]

export default function ClubDashboard() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight">The Club</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your contractor home — social feed, work, and contracts in one place.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AREAS.map(({ href, label, desc, Icon, soon }) => (
          <Link
            key={label}
            href={soon ? '/contractor' : href}
            aria-disabled={soon}
            className={`rounded-xl border border-border bg-card p-4 shadow-sm transition ${soon ? 'pointer-events-none opacity-60' : 'hover:border-primary/40 hover:shadow-md'}`}
          >
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
              <span className="font-display font-semibold">{label}</span>
              {soon && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"><Lock className="size-2.5" /> soon</span>}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <Rss className="mx-auto mb-2 size-7 text-muted-foreground" />
        <p className="text-sm font-medium">Your social feed is being built.</p>
        <p className="mt-1 text-sm text-muted-foreground">Posts, follows, reactions, and achievements land next. Set up your profile in the meantime.</p>
      </div>
    </main>
  )
}
