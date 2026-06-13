import { auth } from '@clerk/nextjs/server'

/**
 * The signed-in viewer's stored timezone, read from Clerk session metadata (mirrored there from Catalog's
 * /account save). SERVER-ONLY (imports @clerk/nextjs/server). null when signed out / unset / Clerk not
 * configured — callers fall back to the browser tz (client) or UTC (server).
 */
export async function viewerTimezone(): Promise<string | null> {
  try {
    const { sessionClaims } = await auth()
    const tz = (sessionClaims?.metadata as { timezone?: unknown } | undefined)?.timezone
    return typeof tz === 'string' && tz ? tz : null
  } catch {
    return null
  }
}
