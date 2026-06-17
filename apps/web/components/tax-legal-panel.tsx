'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Loader2, Landmark, ExternalLink, Scale, FileSignature } from 'lucide-react'
import { openStripeDashboardAction } from '@/app/contractor/actions'

/**
 * Tax & legal hub. Reely pays contractors through Stripe Connect, which collects their tax info at payout setup
 * and issues their tax forms (1099s) — so this surfaces that model + a one-click link into the Stripe Express
 * dashboard (where the forms + tax settings live), plus a plain explainer of the legal relationship. `connected`
 * = the contractor has a Stripe payout account.
 */
export function TaxLegalPanel({ connected }: { connected: boolean }) {
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function openDashboard() {
    setErr(null)
    start(async () => {
      const r = await openStripeDashboardAction()
      if (r.error) { setErr(r.error); return }
      if (r.url) window.location.href = r.url
      else setErr('Your tax dashboard opens once payouts are fully set up.')
    })
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold"><Landmark className="size-4 text-muted-foreground" /> Tax &amp; legal</h2>
      <p className="mb-4 text-sm text-muted-foreground">Reely pays you through Stripe. Your tax details and tax forms are handled there — and your agreements live on each contract.</p>

      <div className="space-y-3">
        <div className="rounded-lg border border-border p-3.5">
          <p className="text-sm font-medium">Your taxes</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You&apos;re an independent contractor, responsible for your own taxes. Stripe collects your tax information (W-9 / tax ID) when you set up payouts and issues your tax forms (e.g. a 1099) — find them, and your tax settings and payout history, in your Stripe dashboard.
          </p>
          <div className="mt-3">
            {connected ? (
              <button type="button" onClick={openDashboard} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3.5 text-sm font-medium hover:bg-muted disabled:opacity-60">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />} Open Stripe dashboard
              </button>
            ) : (
              <p className="text-sm text-amber-700">Set up payouts above to access your tax forms and settings.</p>
            )}
          </div>
          {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
        </div>

        <div className="rounded-lg border border-border p-3.5">
          <p className="flex items-center gap-1.5 text-sm font-medium"><Scale className="size-4 text-muted-foreground" /> Legal</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Work on Reely is governed by the Reely Contractor Terms. Per-engagement agreements — NDAs, IP assignment, and the like — are attached to and signed on each individual contract.
          </p>
          <Link href="/contractor/contracts" className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><FileSignature className="size-3.5" /> Manage agreements on your contracts</Link>
        </div>
      </div>
    </section>
  )
}
