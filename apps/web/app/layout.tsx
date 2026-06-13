import type { Metadata } from 'next'
import { ClerkProvider, SignedIn } from '@clerk/nextjs'
import './globals.css'
import { TzProvider } from '@/lib/timezone'
import { viewerTimezone } from '@/lib/viewer-tz'
import { BetaFeedback } from '@/components/beta-feedback'

export const metadata: Metadata = {
  title: 'Reely Contractor',
  description: 'A vetted-only contractor club — social, work, and contracts in one place.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tz = await viewerTimezone()
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
  const tree = (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <TzProvider tz={tz}>{children}</TzProvider>
        {hasClerk && <SignedIn><BetaFeedback /></SignedIn>}
      </body>
    </html>
  )
  // ClerkProvider only when configured (prod) — keeps the local scaffold runnable without keys.
  return hasClerk ? <ClerkProvider>{tree}</ClerkProvider> : tree
}
