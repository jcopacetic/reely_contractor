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
