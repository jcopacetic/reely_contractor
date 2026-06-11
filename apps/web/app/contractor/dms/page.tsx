import { apiQuery } from '@/lib/api'
import { ContractorHeader } from '@/components/contractor-header'
import { DmInbox } from '@/components/dms'

export const dynamic = 'force-dynamic'

type Participant = { userId: string; displayName: string; avatarUrl: string | null }
type DmMessage = { id: string; body: string; fromMe: boolean; senderUserId: string; createdAt: string }
type Thread = {
  threadId: string
  other: Participant
  lastMessage: { body: string; fromMe: boolean; createdAt: string } | null
  unread: number
  lastActivityAt: string
}
type Own = { profile: { displayName: string; avatarUrl: string | null } | null }

// The DM inbox. Middleware gates /contractor/** to vetted contractors; the store gates every op to the thread
// participants. `?t=<threadId>` deep-links a conversation (the "Message" button on a profile lands here).
export default async function DmsPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  const [threads, own] = await Promise.all([
    apiQuery<Thread[]>('dm.threads').catch(() => [] as Thread[]),
    apiQuery<Own>('profile.getOwn').catch(() => ({ profile: null }) as Own),
  ])
  const me = { displayName: own.profile?.displayName ?? 'You', avatarUrl: own.profile?.avatarUrl ?? null }

  let initialActive: { threadId: string; other: Participant; messages: DmMessage[] } | null = null
  if (t) {
    const conv = await apiQuery<{ messages: DmMessage[]; other: Participant } | { error: string }>('dm.messages', { threadId: t }).catch(() => null)
    if (conv && !('error' in conv)) initialActive = { threadId: t, other: conv.other, messages: conv.messages }
  }

  return (
    <>
      <ContractorHeader active="messages" />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <DmInbox initialThreads={threads} initialActive={initialActive} me={me} />
      </main>
    </>
  )
}
