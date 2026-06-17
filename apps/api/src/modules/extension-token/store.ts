/**
 * extension-token store — per-contractor credentials for the browser-timer extension (it can't hold the
 * server service key). Mint returns the PLAINTEXT once; only its sha256 is stored. Owner-scoped; revocable.
 */
import { randomBytes, createHash } from 'node:crypto'
import { prisma } from '@contractor/db'

export type TokenRow = { id: string; label: string | null; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }

/**
 * Pure crypto/normalization core of `mint` (no DB). Exported for unit tests.
 * Generates an `ext_*` token, its sha256 hex hash, and the normalized label
 * (trimmed, capped at 80 chars, empty → null). Behavior must match `mint`.
 */
export function mintToken(label?: string | null): { token: string; tokenHash: string; label: string | null } {
  const token = `ext_${randomBytes(24).toString('base64url')}`
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return { token, tokenHash, label: label?.trim().slice(0, 80) || null }
}

/** Mint a new token — returns the plaintext ONCE (shown to the contractor to paste into the extension). */
export async function mint(contractorUserId: string, label?: string | null): Promise<{ token: string; id: string }> {
  const { token, tokenHash, label: normLabel } = mintToken(label)
  const row = await prisma.extensionToken.create({ data: { contractorUserId, tokenHash, label: normLabel }, select: { id: true } })
  return { token, id: row.id }
}

export async function list(contractorUserId: string): Promise<TokenRow[]> {
  const rows = await prisma.extensionToken.findMany({ where: { contractorUserId }, orderBy: { createdAt: 'desc' }, select: { id: true, label: true, lastUsedAt: true, revokedAt: true, createdAt: true } })
  return rows.map((r) => ({ id: r.id, label: r.label, lastUsedAt: r.lastUsedAt?.toISOString() ?? null, revokedAt: r.revokedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() }))
}

export async function revoke(contractorUserId: string, id: string): Promise<{ ok: true } | { error: string }> {
  const r = await prisma.extensionToken.findUnique({ where: { id }, select: { contractorUserId: true } })
  if (!r || r.contractorUserId !== contractorUserId) return { error: 'forbidden' }
  await prisma.extensionToken.update({ where: { id }, data: { revokedAt: new Date() } })
  return { ok: true }
}
