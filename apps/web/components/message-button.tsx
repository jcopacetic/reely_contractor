'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MessagesSquare } from 'lucide-react'
import { openThreadAction } from '@/app/contractor/actions'

/** Opens (or creates) the 1:1 thread with a member, then jumps to the inbox on that conversation. */
export function MessageButton({ userId }: { userId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  function open() {
    start(async () => {
      const r = await openThreadAction(userId)
      if (!('error' in r)) router.push(`/contractor/dms?t=${r.threadId}`)
    })
  }
  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <MessagesSquare className="size-4" />} Message
    </button>
  )
}
