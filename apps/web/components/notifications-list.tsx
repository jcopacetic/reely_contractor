'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Rocket, OctagonAlert, MessageSquareText, GitPullRequestArrow, Compass, Bell, CheckCheck, type LucideIcon } from 'lucide-react'
import { markNotificationReadAction, markAllNotificationsReadAction } from '@/app/contractor/actions'

export type Notification = {
  id: string
  type: string
  ceremony: string
  title: string
  contractId: string | null
  contractTitle: string | null
  actorRole: string | null
  read: boolean
  createdAt: string
}

const ICON: Record<string, LucideIcon> = {
  sprint: Rocket,
  blocker: OctagonAlert,
  standup: MessageSquareText,
  change_request: GitPullRequestArrow,
  charter: Compass,
}

function ago(s: string): string {
  const ms = Date.now() - new Date(s).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}d ago` : new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** The notifications feed — each row links to its contract (and marks itself read). The actor is the OTHER party,
 *  so the title reads from their side ("Sprint delivered for review", etc.). Mark-all clears the unread state. */
export function NotificationsList({ initial }: { initial: Notification[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [, start] = useTransition()
  const hasUnread = items.some((n) => !n.read)

  function open(n: Notification) {
    if (!n.read) {
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      start(async () => { await markNotificationReadAction(n.id); router.refresh() })
    }
  }
  function markAll() {
    setItems((xs) => xs.map((x) => ({ ...x, read: true })))
    start(async () => { await markAllNotificationsReadAction(); router.refresh() })
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-xl font-bold"><Bell className="size-5 text-muted-foreground" /> Notifications</h1>
        {hasUnread && <button type="button" onClick={markAll} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><CheckCheck className="size-4" /> Mark all read</button>}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No notifications yet. Activity on your contracts shows up here.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const Icon = ICON[n.ceremony] ?? Bell
            const inner = (
              <div className={`flex items-start gap-3 rounded-xl border p-3.5 transition ${n.read ? 'border-border bg-card' : 'border-primary/30 bg-primary/[0.04]'}`}>
                <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${n.read ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}><Icon className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.contractTitle && <p className="truncate text-xs text-muted-foreground">{n.contractTitle}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{ago(n.createdAt)}</span>
                  {!n.read && <span className="size-2 rounded-full bg-primary" />}
                </div>
              </div>
            )
            return (
              <li key={n.id}>
                {n.contractId ? (
                  <Link href={`/contractor/contracts/${n.contractId}`} onClick={() => open(n)}>{inner}</Link>
                ) : (
                  <button type="button" onClick={() => open(n)} className="block w-full text-left">{inner}</button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
