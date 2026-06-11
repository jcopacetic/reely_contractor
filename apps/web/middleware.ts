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

const clerk = clerkMiddleware(async (auth, req) => {
  if (isPublicProfile(req)) return // public, unauthenticated
  if (!isContractorApp(req)) return // marketing/root — untouched

  await auth.protect() // the whole /contractor area requires sign-in
  if (isApplicantArea(req)) return // apply + status are open to any signed-in user

  // The club app itself: contractor role only.
  const { sessionClaims } = await auth()
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role
  if (role !== 'contractor') return NextResponse.redirect(new URL('/contractor/status', req.url))
})

export default hasClerk ? clerk : () => NextResponse.next()

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
