import { apiQuery } from '@/lib/api'
import { DmInbox } from '@/components/dms'

export const dynamic = 'force-dynamic'

type Kind = 'direct' | 'hire' | 'team'
type RoomMsg = { id: string; body: string; fromMe: boolean; senderUserId: string; senderLabel: string; fromTenant: boolean; createdAt: string }
type Room = {
  roomId: string
  kind: Kind
  title: string
  avatarUrl: string | null
  lastMessage: { body: string; createdAt: string } | null
  unread: number
  lastActivityAt: string
}
type Own = { profile: { displayName: string; avatarUrl: string | null } | null }

// The chat inbox. Middleware gates /contractor/** to vetted contractors; the store gates every op to the room's
// participants. `?r=<roomId>` deep-links a conversation (the "Message" button on a profile lands here).
export default async function DmsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams
  const [rooms, own] = await Promise.all([
    apiQuery<Room[]>('dm.rooms').catch(() => [] as Room[]),
    apiQuery<Own>('profile.getOwn').catch(() => ({ profile: null }) as Own),
  ])
  const me = { displayName: own.profile?.displayName ?? 'You', avatarUrl: own.profile?.avatarUrl ?? null }

  let initialActive: { roomId: string; kind: Kind; title: string; avatarUrl: string | null; messages: RoomMsg[] } | null = null
  if (r) {
    const conv = await apiQuery<{ messages: RoomMsg[]; title: string; kind: Kind } | { error: string }>('dm.messages', { roomId: r }).catch(() => null)
    if (conv && !('error' in conv)) {
      const room = rooms.find((x) => x.roomId === r)
      initialActive = { roomId: r, kind: conv.kind, title: conv.title, avatarUrl: room?.avatarUrl ?? null, messages: conv.messages }
    }
  }

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <DmInbox initialRooms={rooms} initialActive={initialActive} me={me} />
      </main>
    </>
  )
}
