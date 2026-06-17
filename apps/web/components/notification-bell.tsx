'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { notificationsUnreadAction } from '@/app/contractor/actions'

/** The notifications bell for the club rail / tab strip — links to the notifications page and shows a live
 *  unread count (polled lightly; refreshes on route change). Mirrors the rail/tab link styling. */
export function NotificationBell({ variant }: { variant: 'rail' | 'tab' }) {
  const path = usePathname() ?? ''
  const active = path.startsWith('/contractor/notifications')
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let alive = true
    const load = () => { void notificationsUnreadAction().then((n) => { if (alive) setUnread(n) }) }
    load()
    const t = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [path])

  const badge = unread > 0 ? (
    <span className="grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">{unread > 99 ? '99+' : unread}</span>
  ) : null

  if (variant === 'tab') {
    return (
      <Link href="/contractor/notifications" aria-current={active ? 'page' : undefined} title="Notifications" className={`relative grid size-10 place-items-center rounded-full transition ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />}
        <span className="sr-only">Notifications{unread > 0 ? ` (${unread} unread)` : ''}</span>
      </Link>
    )
  }
  return (
    <Link href="/contractor/notifications" aria-current={active ? 'page' : undefined} className={`inline-flex items-center gap-3 rounded-full px-4 py-2.5 text-base transition hover:bg-muted ${active ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
      <Bell className={`size-5 shrink-0 ${active ? 'text-primary' : ''}`} /> <span className="flex-1">Notifications</span> {badge}
    </Link>
  )
}
