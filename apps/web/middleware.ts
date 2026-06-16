import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

/**
 * The Contractor access gate (the owner's hard requirement):
 *  - /pro/[slug]      → PUBLIC marketing profile (no auth). (/c/* belongs to stumble on the apex.)
 *  - /contractor/apply, /contractor/status → any signed-in user (the applicant flow).
 *  - /contractor/**   → the club app: Clerk role `contractor` ONLY (mirrored on vetting approval).
 *    A signed-in non-contractor is redirected to /contractor/status (their application state / apply CTA).
 * Clerk activates only when keys are present (local dev bypasses the gate).
 */
const hasClerk =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) && Boolean(process.env.CLERK_SECRET_KEY)

const isPublicProfile = createRouteMatcher(['/pro/(.*)'])
const isContractorApp = createRouteMatcher(['/contractor(.*)'])
const isApplicantArea = createRouteMatcher(['/contractor/apply', '/contractor/status'])
const isAdminArea = createRouteMatcher(['/contractor/admin(.*)'])

const clerk = clerkMiddleware(async (auth, req) => {
  if (isPublicProfile(req)) return // public, unauthenticated
  if (!isContractorApp(req)) return // marketing/root — untouched

  await auth.protect() // the whole /contractor area requires sign-in
  if (isApplicantArea(req)) return // apply + status are open to any signed-in user

  const { sessionClaims } = await auth()
  const meta = sessionClaims?.metadata as { contractor?: boolean; role?: string } | undefined

  // The vetting console is platform_admin-only — and admins may NOT carry the contractor flag, so it can't
  // sit behind the club gate below. Gate it on the portfolio `role` instead; the page + api re-check too.
  if (isAdminArea(req)) {
    if (meta?.role === 'admin') return
    return NextResponse.redirect(new URL('/contractor/status', req.url))
  }

  // The club app itself: vetted contractors only. Gate on the dedicated `contractor` flag (set on approval),
  // NOT the portfolio-wide `role` — a user can be an admin AND a contractor.
  if (meta?.contractor !== true) return NextResponse.redirect(new URL('/contractor/status', req.url))
})

export default hasClerk ? clerk : () => NextResponse.next()

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
