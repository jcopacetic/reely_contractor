'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Copy, Check, Trash2, KeyRound } from 'lucide-react'
import { mintExtensionTokenAction, revokeExtensionTokenAction } from '@/app/contractor/actions'

type Token = { id: string; label: string | null; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }

/** Mint / copy-once / revoke the per-contractor tokens the timer extension authenticates with. */
export function ExtensionTokens({ initial }: { initial: Token[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [label, setLabel] = useState('')
  const [minted, setMinted] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function mint() {
    setErr(null)
    setMinted(null)
    start(async () => {
      const r = await mintExtensionTokenAction(label)
      if (r.error) setErr(r.error)
      else if (r.token) {
        setMinted(r.token)
        setLabel('')
        router.refresh()
      }
    })
  }
  function revoke(id: string) {
    start(async () => {
      await revokeExtensionTokenAction(id)
      router.refresh()
    })
  }
  function copy() {
    if (!minted) return
    navigator.clipboard.writeText(minted)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">Device label
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. work laptop" className="mt-0.5 block h-9 w-56 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
        </label>
        <button onClick={mint} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Generate token
        </button>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {minted && (
        <div className="rounded-lg border border-amber-400/50 bg-amber-50 p-3">
          <p className="mb-1 text-xs font-medium text-amber-800">Copy this token now — it is shown only once. Paste it into the timer extension.</p>
          <div className="flex items-center gap-2">
            <input readOnly value={minted} className="h-8 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs" />
            <button onClick={copy} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-muted">{copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />} {copied ? 'Copied' : 'Copy'}</button>
          </div>
        </div>
      )}
      {initial.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tokens yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {initial.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-2.5 text-sm">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5"><KeyRound className="size-3.5 text-muted-foreground" /> {t.label ?? 'Token'} {t.revokedAt && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">revoked</span>}</span>
                <p className="text-[11px] text-muted-foreground">{t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : 'never used'} · created {new Date(t.createdAt).toLocaleDateString()}</p>
              </div>
              {!t.revokedAt && <button onClick={() => revoke(t.id)} disabled={pending} title="Revoke" className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive disabled:opacity-50"><Trash2 className="size-4" /></button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
