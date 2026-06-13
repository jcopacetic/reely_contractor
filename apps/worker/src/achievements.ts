/**
 * Achievements / XP engine (event-driven, self-owned — not Catalog). The api emits social events via emit();
 * each enqueues `achievements.process { userId, type }`. Here we: (1) extend the contractor's activity streak,
 * (2) re-evaluate the achievements that event could unlock against the source-of-truth counts (accurate, so a
 * follow/unfollow toggle can't inflate progress), and (3) on a fresh unlock grant its XP, recompute the level,
 * and auto-share a milestone post. Idempotent on the unique (user, achievement) award — duplicates never
 * double-grant XP. Definitions (name/description/xp) come from the seeded `achievement` rows, matched by key.
 */
import { prisma } from '@contractor/db'

const XP_PER_LEVEL = 100
const levelFor = (xp: number) => Math.floor(xp / XP_PER_LEVEL) + 1
const dayKey = (d: Date) => d.toISOString().slice(0, 10) // UTC YYYY-MM-DD

/**
 * Rules: when `event` fires for a contractor, award `key` once their current `measure()` count reaches
 * `threshold`. `measure` reads the source-of-truth table (not the event tally) so progress is accurate.
 * (first_contract / on_the_clock land in Phase 2 when their events exist.)
 */
type Rule = { key: string; event: string; threshold: number; measure: (userId: string) => Promise<number> }
const RULES: Rule[] = [
  { key: 'welcomed', event: 'profile.onboarded', threshold: 1, measure: (u) => prisma.contractorProfile.count({ where: { clerkUserId: u, onboardedAt: { not: null } } }) },
  { key: 'first_post', event: 'post.created', threshold: 1, measure: (u) => prisma.post.count({ where: { authorUserId: u, kind: { not: 'achievement' } } }) },
  { key: 'first_connection', event: 'follow.created', threshold: 1, measure: (u) => prisma.follow.count({ where: { followerUserId: u } }) },
  { key: 'connector', event: 'follow.created', threshold: 5, measure: (u) => prisma.follow.count({ where: { followerUserId: u } }) },
  { key: 'conversationalist', event: 'comment.created', threshold: 10, measure: (u) => prisma.comment.count({ where: { userId: u } }) },
  // onboarding/encouragement nudges toward the work loop + chat (the events already emit)
  { key: 'first_message', event: 'room.message.sent', threshold: 1, measure: (u) => prisma.roomMessage.count({ where: { senderUserId: u, senderTenantRef: null } }) },
  { key: 'first_job', event: 'listing.posted', threshold: 1, measure: (u) => prisma.listing.count({ where: { ownerUserId: u } }) },
  { key: 'first_bid', event: 'bid.submitted', threshold: 1, measure: (u) => prisma.bid.count({ where: { bidderUserId: u } }) },
]

/** Extend the contractor's activity streak. Consecutive UTC days +1; a gap resets to 1; same day is a no-op. */
async function touchStreak(userId: string): Promise<void> {
  const today = dayKey(new Date())
  const stats = await prisma.contractorStats.findUnique({ where: { clerkUserId: userId }, select: { streak: true, lastActiveDay: true } })
  if (stats?.lastActiveDay === today) return
  const yesterday = dayKey(new Date(Date.now() - 86_400_000))
  const streak = stats?.lastActiveDay === yesterday ? (stats.streak || 0) + 1 : 1
  await prisma.contractorStats.upsert({
    where: { clerkUserId: userId },
    update: { streak, lastActiveDay: today },
    create: { clerkUserId: userId, streak: 1, lastActiveDay: today },
  })
}

/** Award `key` once: append the award, grant XP, recompute level, auto-share a milestone post. */
async function award(userId: string, key: string): Promise<void> {
  const a = await prisma.achievement.findUnique({ where: { key }, select: { id: true, name: true, description: true, xp: true } })
  if (!a) return
  try {
    await prisma.achievementAward.create({ data: { userId, achievementId: a.id } })
  } catch {
    return // unique (user, achievement) violation → already awarded; no double-grant
  }
  const cur = await prisma.contractorStats.upsert({
    where: { clerkUserId: userId },
    update: { xp: { increment: a.xp } },
    create: { clerkUserId: userId, xp: a.xp },
    select: { xp: true },
  })
  await prisma.contractorStats.update({ where: { clerkUserId: userId }, data: { level: levelFor(cur.xp) } })
  // Milestone auto-share — a system-authored achievement post. Created directly (NOT via the feed store) so
  // it neither emits post.created nor bumps post_count → no recursion, no first_post inflation.
  await prisma.post.create({ data: { authorUserId: userId, kind: 'achievement', body: `🏆 Unlocked: ${a.name}${a.description ? ` — ${a.description}` : ''}` } })
  // A notify-able record (notifications module consumes it later). System actor → never re-enters the engine.
  await prisma.appEvent.create({ data: { source: 'achievements', type: 'achievement.awarded', actorId: userId, actorType: 'system', payload: { key, xp: a.xp } } })
  console.log(`achievement "${key}" awarded to ${userId} (+${a.xp}xp)`)
}

/** Process one social event: extend the actor's streak, then evaluate any achievements it could unlock. */
export async function processAchievements(data: { userId?: string; type?: string; actorType?: string }): Promise<void> {
  const { userId, type, actorType } = data
  if (!userId || !type) return
  if (actorType !== 'contractor') return // only contractor-actor activity counts toward XP (not admin/system/client)
  await touchStreak(userId)
  for (const r of RULES.filter((r) => r.event === type)) {
    const already = await prisma.achievementAward.findFirst({ where: { userId, achievement: { key: r.key } }, select: { id: true } })
    if (already) continue
    if ((await r.measure(userId)) >= r.threshold) await award(userId, r.key)
  }
}

/**
 * Turn a contractor's work action into an activity-feed post (X-style: your job postings show in your feed). A
 * system-context write (like the achievement auto-share) so it doesn't re-enter the engine. Native contractor
 * jobs only — Board-originated listings (boardPartRef set) belong to a Board member, not the club.
 */
export async function shareWorkActivity(data: { userId?: string; type?: string; actorType?: string; payload?: unknown }): Promise<void> {
  const { userId, type, actorType, payload } = data
  if (!userId || actorType !== 'contractor') return
  if (type === 'listing.posted') {
    const listingId = (payload as { listingId?: string } | null)?.listingId
    if (!listingId) return
    const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { title: true, ownerUserId: true, boardPartRef: true } })
    if (!listing || listing.ownerUserId !== userId || listing.boardPartRef) return
    await prisma.post.create({ data: { authorUserId: userId, kind: 'update', body: `📋 Posted a job — ${listing.title}`, sourceRef: listingId, linkUrl: `/contractor/work/${listingId}`, linkLabel: 'View job' } })
  }
}
