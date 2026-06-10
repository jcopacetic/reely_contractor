import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export const metadata: Metadata = {
  title: 'Reely Contractor',
  description: 'A vetted-only contractor club — social, work, and contracts in one place.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const tree = (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  )
  // ClerkProvider only when configured (prod) — keeps the local scaffold runnable without keys.
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? <ClerkProvider>{tree}</ClerkProvider> : tree
}
