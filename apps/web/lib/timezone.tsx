'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const TzContext = createContext<string | null>(null)

/**
 * Seeds the viewer's timezone (from the server, via Clerk metadata) for client components. SSR-safe: the
 * initial value matches the server (stored tz, or null→UTC at format time), so there's no hydration mismatch.
 * When the user hasn't set a timezone, it upgrades to the browser's tz after mount so they still see local time.
 */
export function TzProvider({ tz, children }: { tz: string | null; children: ReactNode }) {
  const [resolved, setResolved] = useState<string | null>(tz)
  useEffect(() => {
    if (tz) return
    try {
      setResolved(Intl.DateTimeFormat().resolvedOptions().timeZone || null)
    } catch {
      /* noop */
    }
  }, [tz])
  return <TzContext.Provider value={resolved}>{children}</TzContext.Provider>
}

/** The viewer's tz (stored → browser → UTC at format time). Pass to fmtDateTime/fmtDate. */
export function useViewerTz(): string | null {
  return useContext(TzContext)
}
