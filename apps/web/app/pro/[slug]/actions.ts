'use server'

import { apiMutate } from '@/lib/api'

/** Public hire-request submission from a /pro/[slug] profile. Anonymous — the api's publicProcedure validates. */
export async function requestHireAction(input: {
  slug: string
  fromName: string
  fromEmail: string
  message: string
  projectType?: string | null
  budget?: string | null
}): Promise<{ ok?: true; error?: string }> {
  try {
    return await apiMutate<{ ok?: true; error?: string }>('hire.request', input)
  } catch (e) {
    return { error: (e as Error).message }
  }
}
