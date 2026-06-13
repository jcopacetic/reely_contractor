import { apiQuery } from '@/lib/api'
import { ExtensionTokens } from '@/components/extension-tokens'

export const dynamic = 'force-dynamic'

type Token = { id: string; label: string | null; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }

/** Connect the Reely time-tracker extension — mint/revoke the per-device token it authenticates with. */
export default async function ExtensionPage() {
  const tokens = await apiQuery<Token[]>('extensionToken.list').catch(() => [] as Token[])
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight">Timer extension</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect the Reely time-tracker extension to log activity + screenshots against your contracts. Generate a token,
        paste it into the extension, and it tracks verified time automatically. Tokens are shown once and can be revoked anytime.
      </p>
      <div className="mt-6">
        <ExtensionTokens initial={tokens} />
      </div>
    </main>
  )
}
