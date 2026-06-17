'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { Rss, UserCircle, MessagesSquare, Briefcase, Gavel, FileText, Banknote, Inbox, Settings, PenSquare, type LucideIcon } from 'lucide-react'
import { NotificationBell } from '@/components/notification-bell'

const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

type NavItem = { key: string; href: string; label: string; Icon: LucideIcon; match: (p: string) => boolean }
const NAV: NavItem[] = [
  { key: 'feed', href: '/contractor', label: 'Feed', Icon: Rss, match: (p) => p === '/contractor' },
  { key: 'jobs', href: '/contractor/work', label: 'Find Work', Icon: Briefcase, match: (p) => p.startsWith('/contractor/work') },
  { key: 'bids', href: '/contractor/bids', label: 'Bids', Icon: Gavel, match: (p) => p.startsWith('/contractor/bids') },
  { key: 'contracts', href: '/contractor/contracts', label: 'Contracts', Icon: FileText, match: (p) => p.startsWith('/contractor/contracts') },
  { key: 'requests', href: '/contractor/requests', label: 'Requests', Icon: Inbox, match: (p) => p.startsWith('/contractor/requests') },
  { key: 'payouts', href: '/contractor/payouts', label: 'Payouts', Icon: Banknote, match: (p) => p.startsWith('/contractor/payouts') },
  { key: 'messages', href: '/contractor/dms', label: 'Messages', Icon: MessagesSquare, match: (p) => p.startsWith('/contractor/dms') },
  { key: 'profile', href: '/contractor/profile', label: 'Profile', Icon: UserCircle, match: (p) => p.startsWith('/contractor/profile') || p.startsWith('/contractor/u/') },
  { key: 'settings', href: '/contractor/settings', label: 'Settings', Icon: Settings, match: (p) => p.startsWith('/contractor/settings') },
]

// PRE-app flows (apply / status / onboarding) render bare — no club chrome.
const BARE = ['/contractor/apply', '/contractor/status', '/contractor/onboarding', '/contractor/unsubscribe']

function Brand() {
  return (
    <Link href="/contractor" className="inline-flex items-center gap-1.5 font-display font-bold">
      <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">R</span>
      <span className="text-lg">Club</span>
    </Link>
  )
}

/**
 * The contractor club chrome, X/Twitter-style: a LEFT nav rail on desktop (brand top · nav · Post · account bottom)
 * beside a centered content timeline. Below lg the rail collapses to a CENTERED top tab strip under a compact header.
 * Pre-app flows (apply/status/onboarding) opt out and render bare. Work surfaces (feed, find-work, bids, contracts,
 * messages, profile) all live in this one social-style shell.
 */
export default function ContractorLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? ''
  if (BARE.some((b) => path === b || path.startsWith(b + '/'))) return <>{children}</>

  const railLink = (n: NavItem) => {
    const active = n.match(path)
    return (
      <Link
        key={n.key}
        href={n.href}
        aria-current={active ? 'page' : undefined}
        className={`inline-flex items-center gap-3 rounded-full px-4 py-2.5 text-base transition hover:bg-muted ${active ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
      >
        <n.Icon className={`size-5 shrink-0 ${active ? 'text-primary' : ''}`} /> {n.label}
      </Link>
    )
  }
  const tabLink = (n: NavItem) => {
    const active = n.match(path)
    return (
      <Link
        key={n.key}
        href={n.href}
        aria-current={active ? 'page' : undefined}
        title={n.label}
        className={`grid size-10 place-items-center rounded-full transition ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
      >
        <n.Icon className="size-5" />
        <span className="sr-only">{n.label}</span>
      </Link>
    )
  }

  return (
    <div className="min-h-screen">
      {/* mobile: compact top bar + CENTERED tab strip */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Brand />
          {hasClerk && <UserButton afterSignOutUrl="/contractor/status" />}
        </div>
        <nav className="flex justify-start gap-1 overflow-x-auto px-2 py-1.5 sm:justify-center">{NAV.map(tabLink)}<NotificationBell variant="tab" /></nav>
      </header>

      <div className="mx-auto flex w-full max-w-6xl">
        {/* desktop: LEFT rail */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between px-3 py-4 lg:flex">
          <div>
            <div className="mb-4 px-3">
              <Brand />
            </div>
            <nav className="flex flex-col gap-1">{NAV.map(railLink)}<NotificationBell variant="rail" /></nav>
            <Link href="/contractor" className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
              <PenSquare className="size-4" /> Post
            </Link>
          </div>
          {hasClerk && (
            <div className="px-2">
              <UserButton showName afterSignOutUrl="/contractor/status" />
            </div>
          )}
        </aside>

        {/* centered content timeline (the rail + right spacer bound its width, X-style) */}
        <main className="min-w-0 flex-1 lg:border-x lg:border-border">{children}</main>

        {/* right spacer — balances the timeline (a stats/suggestions aside can live here later) */}
        <div className="hidden w-64 shrink-0 lg:block" />
      </div>
    </div>
  )
}
