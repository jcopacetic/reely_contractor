/**
 * skills — the shared skill vocabulary's request/moderation flow. The vocabulary is the job↔contractor MATCH
 * KEY (Board listings + contractor profiles carry the same skill_category ids), so it stays controlled: a
 * contractor can REQUEST a missing skill, which lands `pending` (active=false, never matchable) until an admin
 * approves it into the shared list. Reads of the active list live in the profile/marketplace modules.
 */
import { prisma, Prisma } from '@contractor/db'
import { emit } from '../../events'

/** PURE: a url-safe slug from a skill name (lowercase, & → and, non-alnum → '-', trimmed). */
export function slugifySkill(name: string): string {
  return name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** PURE: validate + normalize a requested skill name. 2–40 chars after trim/collapse; must slugify to ≥2 chars. */
export function cleanSkillName(raw: string): { name: string; slug: string } | { error: string } {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > 40) return { error: 'invalid_name' }
  const slug = slugifySkill(name)
  if (slug.length < 2) return { error: 'invalid_name' }
  return { name, slug }
}

export type SkillRequestView = { id: string; name: string; slug: string; requestedBy: string | null; order: number }

/** A contractor requests a skill that isn't in the list → a pending row awaiting admin review. Idempotent:
 *  an existing ACTIVE skill is reported as already available; an existing PENDING one is a no-op. */
export async function requestSkill(clerkUserId: string, rawName: string): Promise<{ ok: true; status: 'requested' | 'exists' | 'already_pending' } | { error: string }> {
  const c = cleanSkillName(rawName)
  if ('error' in c) return c
  const existing = await prisma.skillCategory.findFirst({ where: { OR: [{ slug: c.slug }, { name: { equals: c.name, mode: 'insensitive' } }] }, select: { active: true, pending: true } })
  if (existing) {
    if (existing.active) return { ok: true, status: 'exists' }
    if (existing.pending) return { ok: true, status: 'already_pending' }
    // a retired (active=false, pending=false) skill — reopen it as pending
    await prisma.skillCategory.updateMany({ where: { slug: c.slug }, data: { pending: true, requestedBy: clerkUserId } })
    return { ok: true, status: 'requested' }
  }
  try {
    await prisma.skillCategory.create({ data: { name: c.name, slug: c.slug, active: false, pending: true, requestedBy: clerkUserId, order: 9999 } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: true, status: 'already_pending' }
    throw e
  }
  await emit('skills', 'skill.requested', clerkUserId, { name: c.name, slug: c.slug }, 'contractor')
  return { ok: true, status: 'requested' }
}

/** Admin: the pending skill requests queue. */
export async function pendingSkillRequests(): Promise<SkillRequestView[]> {
  const rows = await prisma.skillCategory.findMany({ where: { pending: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, requestedBy: true, order: true } })
  return rows
}

/** Admin: approve a pending request → it becomes an active, matchable skill. */
export async function approveSkill(id: string): Promise<{ ok: true } | { error: string }> {
  const s = await prisma.skillCategory.findUnique({ where: { id }, select: { pending: true } })
  if (!s) return { error: 'not_found' }
  await prisma.skillCategory.update({ where: { id }, data: { active: true, pending: false } })
  await emit('skills', 'skill.approved', 'system', { skillId: id }, 'system')
  return { ok: true }
}

/** Admin: reject a pending request → remove it. */
export async function rejectSkill(id: string): Promise<{ ok: true } | { error: string }> {
  const s = await prisma.skillCategory.findUnique({ where: { id }, select: { pending: true } })
  if (!s) return { error: 'not_found' }
  if (!s.pending) return { error: 'not_pending' } // never delete a live, in-use skill through this path
  await prisma.skillCategory.delete({ where: { id } })
  return { ok: true }
}
