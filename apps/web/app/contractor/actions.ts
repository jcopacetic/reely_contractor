'use server'

import { apiMutate } from '@/lib/api'

/** Submit an application (any signed-in user). */
export async function applyAction(): Promise<{ ok: true } | { error: string }> {
  try {
    await apiMutate('identity.apply')
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
}): Promise<Result> {
  try {
    return await apiMutate<Result>('profile.update', input)
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function setSlugAction(slug: string): Promise<Result> {
  try {
    return await apiMutate<Result>('profile.setSlug', { slug })
  } catch (e) {
    return { error: (e as Error).message }
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
