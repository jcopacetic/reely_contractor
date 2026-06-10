import { Sparkles } from 'lucide-react'
import { ApplyForm } from './apply-form'

export const dynamic = 'force-dynamic'

export default function ApplyPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="size-6" /></span>
        <h1 className="font-display text-2xl font-bold tracking-tight">Join the Reely contractor club</h1>
        <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
          A vetted-only club of contractors who work on real Reely projects. We&apos;re selective — apply and
          we&apos;ll review you by hand, or redeem an invite if you have one.
        </p>
      </div>
      <ApplyForm />
    </main>
  )
}
