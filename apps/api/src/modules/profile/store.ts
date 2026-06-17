/**
 * profile store — the contractor's linktree-style public profile + the onboarding setup (basics, skill
 * categories, signed docs). The public read returns ONLY the safe subset and only when is_public. Rollups
 * (contracts_completed, hours_logged) are system-written (Phase 2); never editable here.
 */
import { prisma, Prisma } from '@contractor/db'
import { emit } from '../../events'
import { publicReviews } from '../reviews/store'

/** Docs an applicant must accept to finish onboarding (e-sign integration deferred — acknowledgement v1). */
export const REQUIRED_DOCS = ['contractor-agreement'] as const
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Pure slug validity check (no DB): the SLUG_RE pattern + 3–40 length window, applied to the already
 *  trimmed+lowercased candidate. Shared shape of the inline checks in `update()` and `checkSlug()`. */
export function isValidSlug(s: string): boolean {
  return SLUG_RE.test(s) && s.length >= 3 && s.length <= 40
}

type Link = { label: string; url: string }

/** Ordered landing-page content blocks (the slim-Linktree builder). Validated by the router's zod union. */
export type Block =
  | { id: string; type: 'text'; heading?: string | null; body: string }
  | { id: string; type: 'links'; title?: string | null; items: Link[] }
  | { id: string; type: 'image'; url: string; alt?: string | null; caption?: string | null }
  | { id: string; type: 'list'; title?: string | null; items: string[] }

/** A profile's blocks — synthesizing a single links block from the legacy flat `links` when none exist yet, so
 *  pre-builder profiles still render. The new builder writes `blocks`; `links` is kept only as this fallback. */
export function profileBlocks(blocksJson: unknown, links: Link[]): Block[] {
  const blocks = (blocksJson as Block[] | null) ?? []
  if (blocks.length > 0) return blocks
  if (links.length > 0) return [{ id: 'legacy-links', type: 'links', title: 'Links', items: links }]
  return []
}

export type AvailabilityInput = { acceptingWork: boolean; capacityHours: number | null; awayUntil: Date | null }
export type Availability = { state: 'available' | 'away' | 'unavailable'; capacityHours: number | null; awayUntil: string | null }

/** Derive the single public availability chip from the three stored fields. `now` is injected for testability.
 *  Away (a future awayUntil) wins over everything; then the accepting-work flag; otherwise available, carrying
 *  the optional weekly capacity. The web composes the human label + color from `state`. */
export function availabilityStatus(p: AvailabilityInput, now: Date): Availability {
  if (p.awayUntil && p.awayUntil.getTime() > now.getTime()) return { state: 'away', capacityHours: null, awayUntil: p.awayUntil.toISOString() }
  if (!p.acceptingWork) return { state: 'unavailable', capacityHours: null, awayUntil: null }
  return { state: 'available', capacityHours: p.capacityHours && p.capacityHours > 0 ? p.capacityHours : null, awayUntil: null }
}

export type IndustryRef = { slug: string; label: string }
export type ToolRef = { id: string; name: string; slug: string; domain: string | null }

const INDUSTRY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** PURE sanitize of catalog industry refs from the client: shape + slug pattern + dedupe + cap. Unit-tested. */
export function cleanIndustries(input: unknown): IndustryRef[] {
  if (!Array.isArray(input)) return []
  const out: IndustryRef[] = []
  const seen = new Set<string>()
  for (const x of input) {
    if (!x || typeof x !== 'object') continue
    const slug = String((x as { slug?: unknown }).slug ?? '').trim().toLowerCase()
    const label = String((x as { label?: unknown }).label ?? '').trim().slice(0, 80)
    if (slug.length > 80 || !INDUSTRY_SLUG.test(slug) || !label || seen.has(slug)) continue
    seen.add(slug)
    out.push({ slug, label })
    if (out.length >= 20) break
  }
  return out
}

/** PURE sanitize of catalog company ("tool") refs: non-empty id + name, optional slug/domain, dedupe + cap. */
export function cleanTools(input: unknown): ToolRef[] {
  if (!Array.isArray(input)) return []
  const out: ToolRef[] = []
  const seen = new Set<string>()
  for (const x of input) {
    if (!x || typeof x !== 'object') continue
    const id = String((x as { id?: unknown }).id ?? '').trim().slice(0, 64)
    const name = String((x as { name?: unknown }).name ?? '').trim().slice(0, 120)
    const slug = String((x as { slug?: unknown }).slug ?? '').trim().slice(0, 120)
    const d = (x as { domain?: unknown }).domain
    const domain = typeof d === 'string' && d.trim() ? d.trim().slice(0, 120) : null
    if (!id || !name || seen.has(id)) continue
    seen.add(id)
    out.push({ id, name, slug, domain })
    if (out.length >= 30) break
  }
  return out
}

async function identityId(clerkUserId: string): Promise<string | null> {
  const i = await prisma.contractorIdentity.findUnique({ where: { clerkUserId }, select: { id: true } })
  return i?.id ?? null
}

/** The editor view: the own profile + accepted docs + onboarding state. Null until first save. */
export async function getOwn(clerkUserId: string) {
  const p = await prisma.contractorProfile.findUnique({ where: { clerkUserId }, include: { identity: { select: { status: true } } } })
  if (!p) return { profile: null, requiredDocs: REQUIRED_DOCS, acceptedDocs: [] as string[] }
  const docs = await prisma.onboardingDoc.findMany({ where: { clerkUserId }, select: { docKey: true } })
  return {
    profile: {
      firstName: p.firstName,
      lastName: p.lastName,
      company: p.company,
      position: p.position,
      displayName: p.displayName,
      headline: p.headline,
      bio: p.bio,
      avatarUrl: p.avatarUrl,
      links: (p.links as unknown as Link[]) ?? [],
      blocks: profileBlocks(p.blocks, (p.links as unknown as Link[]) ?? []),
      categoryIds: (p.categoryIds as unknown as string[]) ?? [],
      isPublic: p.isPublic,
      publicSlug: p.publicSlug,
      onboarded: Boolean(p.onboardedAt),
      contractsCompleted: p.contractsCompleted,
      hoursLogged: Number(p.hoursLogged),
      acceptingWork: p.acceptingWork,
      capacityHours: p.capacityHours,
      awayUntil: p.awayUntil ? p.awayUntil.toISOString() : null,
      ratePublic: p.ratePublic,
      location: p.location,
      searchable: p.searchable,
      industries: (p.industries as unknown as IndustryRef[]) ?? [],
      tools: (p.tools as unknown as ToolRef[]) ?? [],
      vetted: p.identity.status === 'vetted',
    },
    requiredDocs: REQUIRED_DOCS,
    acceptedDocs: docs.map((d) => d.docKey),
  }
}

/** Upsert the editable profile fields (basics + links + categories) in one save. Validates categories. */
export async function update(
  clerkUserId: string,
  patch: { firstName?: string; lastName?: string; company?: string | null; position?: string | null; displayName?: string; headline?: string | null; bio?: string | null; avatarUrl?: string | null; links?: Link[]; blocks?: Block[]; categoryIds?: string[]; publicSlug?: string | null; acceptingWork?: boolean; capacityHours?: number | null; awayUntil?: string | null; ratePublic?: number | null; location?: string | null; industries?: unknown; tools?: unknown },
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
  if (patch.firstName !== undefined) data.firstName = patch.firstName.trim()
  if (patch.lastName !== undefined) data.lastName = patch.lastName.trim()
  if (patch.company !== undefined) data.company = patch.company?.trim() || null
  if (patch.position !== undefined) data.position = patch.position?.trim() || null
  // displayName is DERIVED from first + last (the person's name) — NEVER set directly from a company field.
  if (patch.firstName !== undefined || patch.lastName !== undefined) {
    const cur = await prisma.contractorProfile.findUnique({ where: { clerkUserId }, select: { firstName: true, lastName: true } })
    const dn = `${(patch.firstName ?? cur?.firstName ?? '').trim()} ${(patch.lastName ?? cur?.lastName ?? '').trim()}`.trim()
    if (dn) data.displayName = dn
  }
  if (patch.headline !== undefined) data.headline = patch.headline
  if (patch.bio !== undefined) data.bio = patch.bio
  if (patch.avatarUrl !== undefined) data.avatarUrl = patch.avatarUrl
  if (patch.links !== undefined) data.links = patch.links as unknown as Prisma.InputJsonValue
  if (patch.blocks !== undefined) data.blocks = patch.blocks as unknown as Prisma.InputJsonValue
  if (categoryIds !== undefined) data.categoryIds = categoryIds as unknown as Prisma.InputJsonValue
  if (publicSlug !== undefined) data.publicSlug = publicSlug
  if (patch.acceptingWork !== undefined) data.acceptingWork = patch.acceptingWork
  if (patch.capacityHours !== undefined) data.capacityHours = patch.capacityHours && patch.capacityHours > 0 ? Math.min(168, Math.floor(patch.capacityHours)) : null
  if (patch.awayUntil !== undefined) data.awayUntil = patch.awayUntil ? new Date(patch.awayUntil) : null
  if (patch.ratePublic !== undefined) data.ratePublic = patch.ratePublic && patch.ratePublic > 0 ? Math.min(100000, Math.floor(patch.ratePublic)) : null
  if (patch.location !== undefined) data.location = patch.location?.trim().slice(0, 120) || null
  if (patch.industries !== undefined) data.industries = cleanIndustries(patch.industries) as unknown as Prisma.InputJsonValue
  if (patch.tools !== undefined) data.tools = cleanTools(patch.tools) as unknown as Prisma.InputJsonValue

  try {
    await prisma.contractorProfile.upsert({
      where: { clerkUserId },
      update: data,
      create: {
        contractorIdentityId: idId,
        clerkUserId,
        firstName: patch.firstName?.trim() ?? '',
        lastName: patch.lastName?.trim() ?? '',
        company: patch.company?.trim() || null,
        position: patch.position?.trim() || null,
        displayName: `${(patch.firstName ?? '').trim()} ${(patch.lastName ?? '').trim()}`.trim() || patch.displayName?.trim() || 'Contractor',
        headline: patch.headline ?? null,
        bio: patch.bio ?? null,
        avatarUrl: patch.avatarUrl ?? null,
        links: (patch.links ?? []) as unknown as Prisma.InputJsonValue,
        blocks: (patch.blocks ?? []) as unknown as Prisma.InputJsonValue,
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

/** Lightweight availability write (its own path so the chip can toggle without a full profile Save). */
export async function setAvailability(
  clerkUserId: string,
  input: { acceptingWork?: boolean; capacityHours?: number | null; awayUntil?: string | null },
): Promise<{ ok: true } | { error: string }> {
  const data: Prisma.ContractorProfileUncheckedUpdateInput = {}
  if (input.acceptingWork !== undefined) data.acceptingWork = input.acceptingWork
  if (input.capacityHours !== undefined) data.capacityHours = input.capacityHours && input.capacityHours > 0 ? Math.min(168, Math.floor(input.capacityHours)) : null
  if (input.awayUntil !== undefined) data.awayUntil = input.awayUntil ? new Date(input.awayUntil) : null
  try {
    await prisma.contractorProfile.update({ where: { clerkUserId }, data })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return { error: 'no_profile' }
    throw e
  }
  await emit('profile', 'profile.updated', clerkUserId, { userId: clerkUserId })
  return { ok: true }
}

/** Visibility: link-only vs listed. When false, a public profile stays reachable by URL but drops out of the
 *  /pro sitemap + internal search. */
export async function setSearchable(clerkUserId: string, searchable: boolean): Promise<{ ok: true } | { error: string }> {
  try {
    await prisma.contractorProfile.update({ where: { clerkUserId }, data: { searchable } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return { error: 'no_profile' }
    throw e
  }
  return { ok: true }
}

/** A data export of everything the contractor owns here (profile + inbound leads), for the settings page. */
export async function exportData(clerkUserId: string): Promise<Record<string, unknown>> {
  const [profile, hireRequests, prefs] = await Promise.all([
    prisma.contractorProfile.findUnique({ where: { clerkUserId } }),
    prisma.hireRequest.findMany({ where: { contractorUserId: clerkUserId }, orderBy: { createdAt: 'desc' } }),
    prisma.notificationPref.findUnique({ where: { userId: clerkUserId } }),
  ])
  return { exportedAt: new Date().toISOString(), profile, hireRequests, notificationPref: prefs }
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
  if (!p || !p.firstName.trim() || !p.lastName.trim()) missing.push('name')
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
    where: { isPublic: true, searchable: true, publicSlug: { not: null } },
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
    select: { clerkUserId: true, displayName: true, company: true, position: true, headline: true, bio: true, categoryIds: true, avatarUrl: true, links: true, blocks: true, contractsCompleted: true, hoursLogged: true, acceptingWork: true, capacityHours: true, awayUntil: true, ratePublic: true, location: true, industries: true, tools: true, identity: { select: { status: true } } },
  })
  if (!p) return null
  const ids = (p.categoryIds as unknown as string[]) ?? []
  const [cats, reviews] = await Promise.all([
    ids.length ? prisma.skillCategory.findMany({ where: { id: { in: ids } }, select: { name: true } }) : Promise.resolve([]),
    publicReviews(p.clerkUserId),
  ])
  const links = (p.links as unknown as Link[]) ?? []
  return {
    displayName: p.displayName,
    company: p.company,
    position: p.position,
    headline: p.headline,
    bio: p.bio,
    categories: cats.map((c) => c.name),
    avatarUrl: p.avatarUrl,
    links,
    blocks: profileBlocks(p.blocks, links),
    contractsCompleted: p.contractsCompleted,
    hoursLogged: Number(p.hoursLogged),
    vetted: p.identity.status === 'vetted',
    availability: availabilityStatus({ acceptingWork: p.acceptingWork, capacityHours: p.capacityHours, awayUntil: p.awayUntil }, new Date()),
    ratePublic: p.ratePublic,
    location: p.location,
    industries: cleanIndustries(p.industries),
    tools: cleanTools(p.tools),
    reviews,
  }
}

export type ContractorRef = { clerkUserId: string; slug: string; displayName: string; avatarUrl: string | null; headline: string | null; vetted: boolean }
export type ContractorSearchHit = ContractorRef & { skills: string[] }

/** PROVIDER (Board): resolve a public profile slug → its invitable ref + display, so a hire flow that started
 *  on /pro/[slug] can pre-fill the invite. Only public profiles resolve (null otherwise). */
export async function resolveBySlug(slug: string): Promise<ContractorRef | null> {
  const p = await prisma.contractorProfile.findFirst({
    where: { publicSlug: slug.toLowerCase(), isPublic: true },
    select: { clerkUserId: true, publicSlug: true, displayName: true, avatarUrl: true, headline: true, identity: { select: { status: true } } },
  })
  if (!p || !p.publicSlug) return null
  return { clerkUserId: p.clerkUserId, slug: p.publicSlug, displayName: p.displayName, avatarUrl: p.avatarUrl, headline: p.headline, vetted: p.identity.status === 'vetted' }
}

/** PROVIDER (Board): search VETTED + public + searchable contractors by name/headline — powers the "invite up
 *  to 3 candidates" picker. Bounded; safe-subset display fields + a few skill labels. */
export async function searchContractors(q: string, limit = 10): Promise<ContractorSearchHit[]> {
  const needle = q.trim()
  if (!needle) return []
  const rows = await prisma.contractorProfile.findMany({
    where: {
      isPublic: true,
      searchable: true,
      publicSlug: { not: null },
      identity: { status: 'vetted' },
      OR: [
        { displayName: { contains: needle, mode: 'insensitive' } },
        { headline: { contains: needle, mode: 'insensitive' } },
        { company: { contains: needle, mode: 'insensitive' } },
      ],
    },
    take: Math.min(20, Math.max(1, limit)),
    orderBy: { displayName: 'asc' },
    select: { clerkUserId: true, publicSlug: true, displayName: true, avatarUrl: true, headline: true, categoryIds: true, identity: { select: { status: true } } },
  })
  const allIds = [...new Set(rows.flatMap((r) => (r.categoryIds as unknown as string[]) ?? []))]
  const cats = allIds.length ? await prisma.skillCategory.findMany({ where: { id: { in: allIds } }, select: { id: true, name: true } }) : []
  const nameById = new Map(cats.map((c) => [c.id, c.name]))
  return rows.map((r) => ({
    clerkUserId: r.clerkUserId,
    slug: r.publicSlug as string,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
    headline: r.headline,
    vetted: r.identity.status === 'vetted',
    skills: ((r.categoryIds as unknown as string[]) ?? []).map((id) => nameById.get(id)).filter((n): n is string => Boolean(n)).slice(0, 6),
  }))
}
