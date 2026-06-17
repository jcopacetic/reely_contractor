import { apiQuery } from '@/lib/api'
import { NotificationsList, type Notification } from '@/components/notifications-list'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const data = await apiQuery<{ items: Notification[]; unread: number } | null>('notifications.list', {}).catch(() => null)
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <NotificationsList initial={data?.items ?? []} />
    </main>
  )
}
