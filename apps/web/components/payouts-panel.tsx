'use client'

import { useState, useTransition } from 'react'
import { Banknote, Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import { startPayoutOnboardingAction } from '@/app/contractor/actions'

export type PayoutAccount =
  | { connected: false; configured: boolean }
  | { connected: true; configured: boolean; payoutsEnabled: boolean; chargesEnabled: boolean; kycStatus: 'pending' | 'verified' | 'restricted' }

const KYC_STYLE: Record<string, string> = {
  verified: 'bg-emerald-500/15 text-emerald-700',
  pending: 'bg-amber-500/15 text-amber-600',
  restricted: 'bg-destructive/10 text-destructive',
}

/**
 * The contractor's payout (Stripe Connect Express) status + onboarding entry point. When Stripe isn't configured
 * on the platform yet, the connect flow still runs against the stub (so the surface is real before go-live); the
 * panel says as much. Approved time is what bills — this is only the payout destination.
 */
export function PayoutsPanel({ account }: { account: PayoutAccount }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const connect = () =>
    start(async () => {
      setErr(null)
      const r = await startPayoutOnboardingAction()
      if (r.error) setErr(r.error)
      else if (r.url) window.location.href = r.url
    })

  const ready = account.connected && account.payoutsEnabled
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Banknote className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-bold tracking-tight">Payouts</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Get paid for approved time. Each week your approved hours are billed to the client after a 7-day dispute
              window, and the net is transferred to your connected account.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          {!account.connected ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
              <AlertCircle className="size-3.5" /> Not connected
            </span>
          ) : (
            <>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium capitalize ${KYC_STYLE[account.kycStatus] ?? 'bg-muted'}`}>
                {account.kycStatus === 'verified' ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />} {account.kycStatus}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">Payouts {account.payoutsEnabled ? 'enabled' : 'pending'}</span>
            </>
          )}
          {!account.configured && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-600">Stripe in setup — preview mode</span>}
        </div>

        <div className="mt-4">
          {ready ? (
            <p className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
              <CheckCircle2 className="size-4" /> Your account is ready to receive payouts.
            </p>
          ) : (
            <button
              onClick={connect}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
              {account.connected ? 'Complete setup' : 'Connect Stripe to get paid'}
            </button>
          )}
          {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
        </div>
      </section>

      <p className="px-1 text-xs text-muted-foreground">
        Powered by Stripe Connect. Reely never sees your bank details — they go straight to Stripe. Your weekly
        billing breakdown lives on each contract.
      </p>
    </div>
  )
}
