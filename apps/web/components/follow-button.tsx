'use client'

import { useState, useTransition } from 'react'
import { Loader2, UserPlus, UserCheck } from 'lucide-react'
import { toggleFollowAction } from '@/app/contractor/actions'

/** Optimistic follow toggle. Owns the live follower count so the header stat updates on click. */
export function FollowButton({
  userId,
  initialFollowing,
  initialFollowerCount,
}: {
  userId: string
  initialFollowing: boolean
  initialFollowerCount: number
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [count, setCount] = useState(initialFollowerCount)
  const [pending, start] = useTransition()

  function toggle() {
    const next = !following
    // optimistic
    setFollowing(next)
    setCount((c) => c + (next ? 1 : -1))
    start(async () => {
      const r = await toggleFollowAction(userId)
      if ('error' in r) {
        // revert
        setFollowing(!next)
        setCount((c) => c + (next ? -1 : 1))
      } else {
        setFollowing(r.following)
        setCount(r.followerCount)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      data-count={count}
      className={`inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium transition disabled:opacity-60 ${
        following ? 'border border-border text-muted-foreground hover:bg-muted' : 'bg-primary text-primary-foreground hover:opacity-90'
      }`}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : following ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}
      {following ? 'Following' : 'Follow'}
    </button>
  )
}
