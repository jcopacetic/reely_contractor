import { apiMutate } from '@/lib/api'

export const dynamic = 'force-dynamic'

/** One-click unsubscribe landing — reads ?u=<userId>&t=<token> from the digest email and flips the recipient's
 *  email-digest opt-out (token-verified server-side; no login needed). Renders a plain confirmation. */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; t?: string }> }) {
  const { u, t } = await searchParams
  let ok = false
  if (u && t) {
    ok = await apiMutate<{ ok?: boolean }>('notifications.unsubscribe', { userId: u, token: t }).then((r) => Boolean(r?.ok)).catch(() => false)
  }
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-xl font-bold">{ok ? 'You’re unsubscribed' : 'Link expired'}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {ok
          ? 'You won’t get notification digest emails anymore. You’ll still see everything in the app — manage it anytime from your notifications.'
          : 'We couldn’t verify this unsubscribe link. Open the latest digest email and try again, or turn off emails from inside the app.'}
      </p>
      <a href="/contractor/notifications" className="mt-5 inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">Go to notifications</a>
    </main>
  )
}
