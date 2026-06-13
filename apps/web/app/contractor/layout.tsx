'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { Rss, UserCircle, MessagesSquare, Briefcase, Gavel, FileText, type LucideIcon } from 'lucide-react'

const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

type NavItem = { key: string; href: string; label: string; Icon: LucideIcon; match: (p: string) => boolean }
const NAV: NavItem[] = [
  { key: 'feed', href: '/contractor', label: 'Feed', Icon: Rss, match: (p) => p === '/contractor' },
  { key: 'profile', href: '/contractor/profile', label: 'Profile', Icon: UserCircle, match: (p) => p.startsWith('/contractor/profile') || p.startsWith('/contractor/u/') },
  { key: 'messages', href: '/contractor/dms', label: 'Messages', Icon: MessagesSquare, match: (p) => p.startsWith('/contractor/dms') },
  { key: 'jobs', href: '/contractor/work', label: 'Find Work', Icon: Briefcase, match: (p) => p.startsWith('/contractor/work') },
  { key: 'bids', href: '/contractor/bids', label: 'Bids', Icon: Gavel, match: (p) => p.startsWith('/contractor/bids') },
  { key: 'contracts', href: '/contractor/contracts', label: 'Contracts', Icon: FileText, match: (p) => p.startsWith('/contractor/contracts') },
]

// PRE-app flows (apply / status / onboarding) render bare — no club chrome.
const BARE = ['/contractor/apply', '/contractor/status', '/contractor/onboarding']

function NavLink({ n, active }: { n: NavItem; active: boolean }) {
  return (
    <Link
      href={n.href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted'}`}
    >
      <n.Icon className="size-4 shrink-0" /> {n.label}
    </Link>
  )
}

/**
 * The contractor club chrome: a FULL-WIDTH header (logo left · Clerk right) over a centered content column with
 * the nav as a RIGHT-SIDE RAIL (lg+). Below lg the rail collapses to a horizontal strip under the header so the
 * club stays navigable on mobile. Pre-app flows (apply/status/onboarding) opt out and render bare.
 */
export default function ContractorLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? ''
  if (BARE.some((b) => path === b || path.startsWith(b + '/'))) return <>{children}</>

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 w-full border-b border-border bg-background/90 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <Link href="/contractor" className="inline-flex items-center gap-1.5 font-display font-bold">
            <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-sm text-primary">R</span>
            <span>Club</span>
          </Link>
          {hasClerk && <UserButton afterSignOutUrl="/contractor/status" />}
        </div>
        {/* mobile / < lg nav strip (the rail is hidden there) */}
        <nav className="flex gap-1 overflow-x-auto border-t border-border px-2 py-1 lg:hidden">
          {NAV.map((n) => (
            <NavLink key={n.key} n={n} active={n.match(path)} />
          ))}
        </nav>
      </header>

      <div className="mx-auto flex w-full max-w-5xl gap-6 px-3 sm:px-4">
        <div className="min-w-0 flex-1">{children}</div>
        <aside className="sticky top-[3.75rem] hidden h-fit w-52 shrink-0 py-6 lg:block">
          <nav className="flex flex-col gap-1">
            {NAV.map((n) => (
              <NavLink key={n.key} n={n} active={n.match(path)} />
            ))}
          </nav>
        </aside>
      </div>
    </div>
  )
}
