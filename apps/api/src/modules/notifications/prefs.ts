/**
 * notification preferences — the per-category × per-channel matrix. Storage is a single JSON column on
 * notification_pref ({ <category>: { inApp?: bool, email?: bool } }); ABSENT = on (restraint default). The
 * pure helpers here (category mapping + channelEnabled) gate both the in-app write (notify.ts / hire) and the
 * email digest, and are unit-tested without the DB.
 */
export type Channel = 'inApp' | 'email'
export type CategoryPrefs = Record<string, { inApp?: boolean; email?: boolean }>

/** User-facing categories. `inAppLocked` = transactional, so the in-app bell can't be muted (email still can). */
export const NOTIFY_CATEGORIES = [
  { key: 'work', label: 'Work & ceremonies', desc: 'Stand-ups, sprints, blockers, change requests, charters', inAppLocked: false },
  { key: 'hire', label: 'Hire requests', desc: 'New leads from your public profile', inAppLocked: false },
  { key: 'billing', label: 'Billing & payouts', desc: 'Charges, disputes, and account standing', inAppLocked: true },
] as const

export type CategoryKey = (typeof NOTIFY_CATEGORIES)[number]['key']

const CEREMONY_TO_CATEGORY: Record<string, CategoryKey> = {
  standup: 'work', sprint: 'work', blocker: 'work', change_request: 'work', charter: 'work',
  hire: 'hire',
  account: 'billing', billing: 'billing',
}

/** Map a notification's `ceremony` tag to its user-facing category (defaults to 'work'). */
export function categoryForCeremony(ceremony: string): CategoryKey {
  return CEREMONY_TO_CATEGORY[ceremony] ?? 'work'
}

const LOCKED_IN_APP = new Set(NOTIFY_CATEGORIES.filter((c) => c.inAppLocked).map((c) => c.key as string))

/** Is `channel` enabled for `category`? Default ON (absent pref = on). A locked category's in-app bell is
 *  always on (transactional); its email can still be muted. */
export function channelEnabled(prefs: CategoryPrefs, category: string, channel: Channel): boolean {
  if (channel === 'inApp' && LOCKED_IN_APP.has(category)) return true
  return prefs[category]?.[channel] !== false
}

/** Coerce a stored JSON value into a safe CategoryPrefs (defensive — the column is free-form JSON). */
export function asCategoryPrefs(json: unknown): CategoryPrefs {
  if (!json || typeof json !== 'object') return {}
  const out: CategoryPrefs = {}
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (v && typeof v === 'object') {
      const e = v as { inApp?: unknown; email?: unknown }
      out[k] = { ...(typeof e.inApp === 'boolean' ? { inApp: e.inApp } : {}), ...(typeof e.email === 'boolean' ? { email: e.email } : {}) }
    }
  }
  return out
}
