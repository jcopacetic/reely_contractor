import Link from 'next/link'
import { Clock, CheckCircle2, XCircle, ArrowRight } from 'lucide-react'
import { apiQuery } from '@/lib/api'

export const dynamic = 'force-dynamic'

type StatusView = {
  identityStatus: 'applicant' | 'vetted' | 'suspended' | null
  vettedAt: string | null
  application: { status: 'submitted' | 'in_review' | 'approved' | 'rejected'; createdAt: string; decidedAt: string | null } | null
}

export default async function StatusPage() {
  let s: StatusView | null = null
  try {
    s = await apiQuery<StatusView>('identity.getStatus')
  } catch {
    s = null
  }

  // Vetted → the club is open.
  if (s?.identityStatus === 'vetted') {
    return (
      <Shell>
        <CheckCircle2 className="mx-auto mb-3 size-9 text-emerald-600" />
        <h1 className="font-display text-2xl font-bold tracking-tight">You&apos;re in.</h1>
        <p className="mt-2 text-sm text-muted-foreground">Welcome to the club. Head to your dashboard to set up your profile and start posting.</p>
        <Link href="/contractor" className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">Enter the club <ArrowRight className="size-4" /></Link>
      </Shell>
    )
  }

  // Has an application pending review.
  if (s?.application && (s.application.status === 'submitted' || s.application.status === 'in_review')) {
    return (
      <Shell>
        <Clock className="mx-auto mb-3 size-9 text-amber-500" />
        <h1 className="font-display text-2xl font-bold tracking-tight">Application under review</h1>
        <p className="mt-2 text-sm text-muted-foreground">We review every applicant by hand — thanks for your patience. We&apos;ll email you when there&apos;s a decision.</p>
      </Shell>
    )
  }

  // Rejected.
  if (s?.application?.status === 'rejected') {
    return (
      <Shell>
        <XCircle className="mx-auto mb-3 size-9 text-muted-foreground" />
        <h1 className="font-display text-2xl font-bold tracking-tight">Not a fit right now</h1>
        <p className="mt-2 text-sm text-muted-foreground">We couldn&apos;t approve your application at this time. Thanks for your interest in the club.</p>
      </Shell>
    )
  }

  // No application yet → apply CTA.
  return (
    <Shell>
      <h1 className="font-display text-2xl font-bold tracking-tight">You haven&apos;t applied yet</h1>
      <p className="mt-2 text-sm text-muted-foreground">The contractor club is vetted-only. Apply (or redeem an invite) to get started.</p>
      <Link href="/contractor/apply" className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">Apply now <ArrowRight className="size-4" /></Link>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-md px-6 py-20 text-center">{children}</main>
}
