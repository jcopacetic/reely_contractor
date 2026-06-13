'use server'

/** Beta feedback → the Catalog feedback sink (service-key POST). Logged-in user id attached when available. */
const CATALOG = (process.env.CATALOG_API_URL ?? '').replace(/\/$/, '')
const KEY = process.env.CATALOG_SERVICE_KEY ?? ''
const NODE = 'contractor'

export async function submitFeedbackAction(category: 'bug' | 'idea' | 'other', body: string, surface: string): Promise<{ ok?: true; error?: string }> {
  if (!body.trim()) return { error: 'Empty message.' }
  if (!CATALOG || !KEY) return { error: 'Feedback isn’t configured here yet.' }
  let clerkUserId: string | null = null
  try {
    const { auth } = await import('@clerk/nextjs/server')
    clerkUserId = (await auth()).userId ?? null
  } catch {
    /* Clerk unset locally */
  }
  try {
    const res = await fetch(`${CATALOG}/trpc/feedback.submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-portfolio-service-key': KEY },
      body: JSON.stringify({ node: NODE, surface: surface.slice(0, 300), category, body: body.trim(), clerkUserId }),
    })
    if (!res.ok) return { error: 'Could not send feedback.' }
    return { ok: true }
  } catch {
    return { error: 'Could not send feedback.' }
  }
}
