/**
 * profile store — the contractor's linktree-style public profile + the onboarding setup (basics, skill
 * categories, signed docs). The public read returns ONLY the safe subset and only when is_public. Rollups
 * (contracts_completed, hours_logged) are system-written (Phase 2); never editable here.
 */
import { prisma, Prisma } from '@contractor/db'
import { emit } from '../../events'

/** Docs an applicant must accept to finish onboarding (e-sign integration deferred — acknowledgement v1). */
export const REQUIRED_DOCS = ['contractor-agreement'] as const
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type Link = { label: string; url: string }

async function identityId(clerkUserId: string): Promise<string | null> {
  const i = await prisma.contractorIdentity.findUnique({ where: { clerkUserId }, select: { id: true } })
  return i?.id ?? null
}

/** The editor view: the own profile + accepted docs + onboarding state. Null until first save. */
export async function getOwn(clerkUserId: string) {
  const p = await prisma.contractorProfile.findUnique({ where: { clerkUserId } })
  if (!p) return { profile: null, requiredDocs: REQUIRED_DOCS, acceptedDocs: [] as string[] }
  const docs = await prisma.onboardingDoc.findMany({ where: { clerkUserId }, select: { docKey: true } })
  return {
    profile: {
      displayName: p.displayName,
      headline: p.headline,
      bio: p.bio,
      avatarUrl: p.avatarUrl,
      links: (p.links as unknown as Link[]) ?? [],
      categoryIds: (p.categoryIds as unknown as string[]) ?? [],
      isPublic: p.isPublic,
      publicSlug: p.publicSlug,
      onboarded: Boolean(p.onboardedAt),
      contractsCompleted: p.contractsCompleted,
      hoursLogged: Number(p.hoursLogged),
    },
    requiredDocs: REQUIRED_DOCS,
    acceptedDocs: docs.map((d) => d.docKey),
  }
}

/** Upsert the editable profile fields (basics + links + categories) in one save. Validates categories. */
export async function update(
  clerkUserId: string,
  patch: { displayName?: string; headline?: string | null; bio?: string | null; avatarUrl?: string | null; links?: Link[]; categoryIds?: string[]; publicSlug?: string | null },
): Promise<{ ok: true } | { error: string }> {
  const idId = await identityId(clerkUserId)
  if (!idId) return { error: 'no_identity' }

  let categoryIds: string[] | undefined
  if (patch.categoryIds) {
    const valid = await prisma.skillCategory.findMany({ where: { id: { in: patch.categoryIds }, active: true }, select: { id: true } })
    categoryIds = valid.map((v) => v.id)
  }

  // Slug: optional. Empty/null clears it; a value must be valid (uniqueness enforced by the upsert below).
  let publicSlug: string | null | undefined
  if (patch.publicSlug !== undefined) {
    const raw = (patch.publicSlug ?? '').trim().toLowerCase()
    if (raw === '') publicSlug = null
    else if (!SLUG_RE.test(raw) || raw.length < 3 || raw.length > 40) return { error: 'invalid_slug' }
    else publicSlug = raw
  }

  const data: Prisma.ContractorProfileUncheckedUpdateInput = {}
  if (patch.displayName !== undefined) data.displayName = patch.displayName
  if (patch.headline !== undefined) data.headline = patch.headline
  if (patch.bio !== undefined) data.bio = patch.bio
  if (patch.avatarUrl !== undefined) data.avatarUrl = patch.avatarUrl
  if (patch.links !== undefined) data.links = patch.links as unknown as Prisma.InputJsonValue
  if (categoryIds !== undefined) data.categoryIds = categoryIds as unknown as Prisma.InputJsonValue
  if (publicSlug !== undefined) data.publicSlug = publicSlug

  try {
    await prisma.contractorProfile.upsert({
      where: { clerkUserId },
      update: data,
      create: {
        contractorIdentityId: idId,
        clerkUserId,
        displayName: patch.displayName ?? 'Contractor',
        headline: patch.headline ?? null,
        bio: patch.bio ?? null,
        avatarUrl: patch.avatarUrl ?? null,
        links: (patch.links ?? []) as unknown as Prisma.InputJsonValue,
        categoryIds: (categoryIds ?? []) as unknown as Prisma.InputJsonValue,
        publicSlug: publicSlug ?? null,
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { error: 'slug_taken' }
    throw e
  }
  await emit('profile', 'profile.updated', clerkUserId, { userId: clerkUserId })
  return { ok: true }
}

export async function setPublic(clerkUserId: string, isPublic: boolean): Promise<{ ok: true } | { error: string }> {
  if (isPublic) {
    const p = await prisma.contractorProfile.findUnique({ where: { clerkUserId }, select: { publicSlug: true } })
    if (!p?.publicSlug) return { error: 'slug_required' }
  }
  await prisma.contractorProfile.update({ where: { clerkUserId }, data: { isPublic } })
  return { ok: true }
}

/** Pure availability check for a public slug — no write. Powers the onboarding "Check" button; the slug is
 *  actually persisted by `update` (on Save) and only goes live via `setPublic`. */
export async function checkSlug(clerkUserId: string, slug: string): Promise<{ available: boolean; reason?: 'invalid' | 'taken' }> {
  const s = slug.trim().toLowerCase()
  if (!SLUG_RE.test(s) || s.length < 3 || s.length > 40) return { available: false, reason: 'invalid' }
  const taken = await prisma.contractorProfile.findFirst({ where: { publicSlug: s, clerkUserId: { not: clerkUserId } }, select: { id: true } })
  return taken ? { available: false, reason: 'taken' } : { available: true }
}

export async function acceptDoc(clerkUserId: string, docKey: string, version = 'v1'): Promise<{ ok: true }> {
  await prisma.onboardingDoc.upsert({
    where: { clerkUserId_docKey: { clerkUserId, docKey } },
    update: { version, acceptedAt: new Date() },
    create: { clerkUserId, docKey, version },
  })
  return { ok: true }
}

/** Mark onboarding complete once basics + ≥1 category + all required docs are in place. */
export async function completeOnboarding(clerkUserId: string): Promise<{ ok: true } | { error: string; missing: string[] }> {
  const p = await prisma.contractorProfile.findUnique({ where: { clerkUserId } })
  const docs = await prisma.onboardingDoc.findMany({ where: { clerkUserId }, select: { docKey: true } })
  const accepted = new Set(docs.map((d) => d.docKey))
  const missing: string[] = []
  if (!p || !p.displayName.trim()) missing.push('display_name')
  if (!p || ((p.categoryIds as unknown as string[]) ?? []).length === 0) missing.push('categories')
  for (const d of REQUIRED_DOCS) if (!accepted.has(d)) missing.push(`doc:${d}`)
  if (missing.length) return { error: 'incomplete', missing }

  await prisma.contractorProfile.update({ where: { clerkUserId }, data: { onboardedAt: new Date() } })
  await emit('profile', 'profile.onboarded', clerkUserId, { userId: clerkUserId })
  return { ok: true }
}

/** Active skill-category vocabulary for the picker. */
export async function listCategories() {
  return prisma.skillCategory.findMany({ where: { active: true }, orderBy: { order: 'asc' }, select: { id: true, name: true, slug: true } })
}

/** PUBLIC: every public profile's slug + lastmod, for the /pro sitemap. Only is_public profiles with a slug.
 *  Bounded; the safe subset (no PII beyond the already-public slug + an opaque timestamp). */
export async function listPublicSlugs(): Promise<Array<{ slug: string; updatedAt: string }>> {
  const rows = await prisma.contractorProfile.findMany({
    where: { isPublic: true, publicSlug: { not: null } },
    select: { publicSlug: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 5000,
  })
  return rows.map((r) => ({ slug: r.publicSlug as string, updatedAt: r.updatedAt.toISOString() }))
}

/** PUBLIC read: the safe subset only, only when is_public. A non-public/unknown slug returns null (→ 404). */
export async function getPublic(slug: string) {
  const p = await prisma.contractorProfile.findFirst({
    where: { publicSlug: slug.toLowerCase(), isPublic: true },
    select: { displayName: true, headline: true, bio: true, categoryIds: true, avatarUrl: true, links: true, contractsCompleted: true, hoursLogged: true },
  })
  if (!p) return null
  const ids = (p.categoryIds as unknown as string[]) ?? []
  const cats = ids.length ? await prisma.skillCategory.findMany({ where: { id: { in: ids } }, select: { name: true } }) : []
  return {
    displayName: p.displayName,
    headline: p.headline,
    bio: p.bio,
    categories: cats.map((c) => c.name),
    avatarUrl: p.avatarUrl,
    links: (p.links as unknown as Link[]) ?? [],
    contractsCompleted: p.contractsCompleted,
    hoursLogged: Number(p.hoursLogged),
  }
}
