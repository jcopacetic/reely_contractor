'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pause, Play } from 'lucide-react'
import { setContractPausedAction } from '@/app/contractor/actions'

/** Pause / resume a contract. Pausing stops the clock immediately and notifies both parties. Only shown while
 *  the contract is active or paused (a closed contract can't be paused). */
export function PauseControl({ contractId, status }: { contractId: string; status: string }) {
  const router = useRouter()
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (status !== 'active' && status !== 'paused') return null
  const paused = status === 'paused'

  function toggle() {
    setErr(null)
    start(async () => {
      const r = await setContractPausedAction(contractId, !paused)
      if ('error' in r && r.error) setErr(r.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      {paused && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700">Paused</span>}
      <button type="button" onClick={toggle} disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60">
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
        {paused ? 'Resume' : 'Pause'}
      </button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  )
}
