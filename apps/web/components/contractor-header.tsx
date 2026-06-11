'use client'

import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { Rss, UserCircle, MessagesSquare, Briefcase, Gavel, FileText } from 'lucide-react'

const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

const NAV: { key: string; href: string; label: string; Icon: typeof Rss; soon?: boolean }[] = [
  { key: 'feed', href: '/contractor', label: 'Feed', Icon: Rss },
  { key: 'profile', href: '/contractor/profile', label: 'Profile', Icon: UserCircle },
  { key: 'messages', href: '/contractor/dms', label: 'Messages', Icon: MessagesSquare },
  { key: 'jobs', href: '/contractor/work', label: 'Find Work', Icon: Briefcase },
  { key: 'bids', href: '/contractor/bids', label: 'Bids', Icon: Gavel },
  { key: 'contracts', href: '/contractor/contracts', label: 'Contracts', Icon: FileText },
]

/** The contractor club top nav. Real areas link; not-yet-built ones show a muted "soon" state. */
export function ContractorHeader({ active }: { active?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-1 px-4 py-2.5">
        <Link href="/contractor" className="mr-1 inline-flex items-center gap-1.5 font-display font-bold">
          <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-sm text-primary">R</span>
          <span className="hidden sm:inline">Club</span>
        </Link>
        {NAV.map(({ key, href, label, Icon, soon }) => (
          <Link
            key={key}
            href={soon ? '/contractor' : href}
            aria-disabled={soon}
            title={soon ? `${label} — coming soon` : label}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm transition ${active === key ? 'bg-primary/10 font-medium text-primary' : soon ? 'pointer-events-none text-muted-foreground/50' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <Icon className="size-4" /> <span className="hidden sm:inline">{label}</span>
          </Link>
        ))}
        <div className="ml-auto">{hasClerk && <UserButton afterSignOutUrl="/contractor/status" />}</div>
      </div>
    </header>
  )
}
