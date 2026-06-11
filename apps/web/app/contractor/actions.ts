'use server'

import { apiMutate, apiQuery } from '@/lib/api'

/** Submit an application (any signed-in user). */
export async function applyAction(): Promise<{ ok: true } | { error: string }> {
  try {
    await apiMutate('identity.submit')
    return { ok: true }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/** Redeem an invite code → an invite-sourced application. */
export async function redeemInviteAction(code: string): Promise<{ ok: true } | { error: string }> {
  try {
    const r = await apiMutate<{ error?: string }>('identity.redeemInvite', { code })
    if (r && 'error' in r && r.error) return { error: r.error }
    return { ok: true }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ── Profile / onboarding ─────────────────────────────────────────────────────────
type Link = { label: string; url: string }
type Result = { ok?: true; error?: string; missing?: string[] }

export async function saveProfileAction(input: {
  displayName?: string
  headline?: string | null
  bio?: string | null
  links?: Link[]
  categoryIds?: string[]
  publicSlug?: string | null
}): Promise<Result> {
  try {
    return await apiMutate<Result>('profile.update', input)
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function checkSlugAction(slug: string): Promise<{ available: boolean; reason?: 'invalid' | 'taken'; error?: string }> {
  try {
    return await apiQuery<{ available: boolean; reason?: 'invalid' | 'taken' }>('profile.checkSlug', { slug })
  } catch (e) {
    return { available: false, error: (e as Error).message }
  }
}

export async function setPublicAction(isPublic: boolean): Promise<Result> {
  try {
    return await apiMutate<Result>('profile.setPublic', { isPublic })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function acceptDocAction(docKey: string): Promise<Result> {
  try {
    return await apiMutate<Result>('profile.acceptDoc', { docKey })
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function completeOnboardingAction(): Promise<Result> {
  try {
    return await apiMutate<Result>('profile.completeOnboarding')
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ── Feed ─────────────────────────────────────────────────────────────────────────
export async function createPostAction(body: string): Promise<{ ok?: true; error?: string }> {
  try {
    await apiMutate('feed.createPost', { body })
    return { ok: true }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function reactAction(
  postId: string,
  type: string,
): Promise<{ myReaction: string | null; reactionCount: number } | { error: string }> {
  try {
    return await apiMutate<{ myReaction: string | null; reactionCount: number }>('feed.react', { postId, type })
  } catch (e) {
    return { error: (e as Error).message }
  }
}
