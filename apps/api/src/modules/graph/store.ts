/**
 * graph store — the contractor social graph: follow edges + the in-club profile view. Follows are a simple
 * directed edge (follower → followee), unique per pair, no self-follow. `getClubProfile` is the authenticated
 * profile a contractor sees of another (full profile + follower/following counts + their own follow state) —
 * distinct from the anonymous public `/pro/[slug]` safe-subset.
 */
import { prisma } from '@contractor/db'
import { emit } from '../../events'
import { inAppEnabled } from '../notifications/store'

/** Toggle a follow edge. Returns the new state + the followee's follower count. */
export async function toggleFollow(followerUserId: string, followeeUserId: string): Promise<{ following: boolean; followerCount: number } | { error: string }> {
  if (followerUserId === followeeUserId) return { error: 'self' }
  const existing = await prisma.follow.findUnique({ where: { followerUserId_followeeUserId: { followerUserId, followeeUserId } }, select: { id: true } })
  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } })
  } else {
    await prisma.follow.create({ data: { followerUserId, followeeUserId } })
    await emit('graph', 'follow.created', followerUserId, { followeeUserId })
    // Social = in-app only (ambient; never email). Defaults on (no 'social' pref category yet). Fire-and-forget.
    if (await inAppEnabled(followeeUserId, 'social')) {
      await prisma.notification.create({
        data: { userId: followeeUserId, type: 'follow.created', payload: { ceremony: 'social', title: 'You have a new follower', followerUserId } },
      }).catch(() => {})
    }
  }
  const followerCount = await prisma.follow.count({ where: { followeeUserId } })
  return { following: !existing, followerCount }
}

type Badge = { key: string; name: string; description: string | null; xp: number; awardedAt: string }
type ClubProfile = {
  userId: string
  displayName: string
  company: string | null
  position: string | null
  headline: string | null
  bio: string | null
  categories: string[]
  avatarUrl: string | null
  publicSlug: string | null
  links: { label: string; url: string }[]
  contractsCompleted: number
  hoursLogged: number
  followerCount: number
  followingCount: number
  isFollowing: boolean
  isSelf: boolean
  level: number
  xp: number
  streak: number
  achievements: Badge[]
}

/** The authenticated in-club profile of `targetUserId`, as seen by `viewerUserId`. Null if no profile. */
export async function getClubProfile(viewerUserId: string, targetUserId: string): Promise<ClubProfile | null> {
  const p = await prisma.contractorProfile.findUnique({ where: { clerkUserId: targetUserId } })
  if (!p) return null
  const ids = (p.categoryIds as unknown as string[]) ?? []
  const isSelf = viewerUserId === targetUserId
  const [cats, followerCount, followingCount, follow, stats, awards] = await Promise.all([
    ids.length ? prisma.skillCategory.findMany({ where: { id: { in: ids } }, select: { name: true } }) : Promise.resolve([] as { name: string }[]),
    prisma.follow.count({ where: { followeeUserId: targetUserId } }),
    prisma.follow.count({ where: { followerUserId: targetUserId } }),
    isSelf ? Promise.resolve(null) : prisma.follow.findUnique({ where: { followerUserId_followeeUserId: { followerUserId: viewerUserId, followeeUserId: targetUserId } }, select: { id: true } }),
    prisma.contractorStats.findUnique({ where: { clerkUserId: targetUserId }, select: { xp: true, level: true, streak: true } }),
    prisma.achievementAward.findMany({
      where: { userId: targetUserId },
      orderBy: { awardedAt: 'desc' },
      select: { awardedAt: true, achievement: { select: { key: true, name: true, description: true, xp: true } } },
    }),
  ])
  return {
    userId: targetUserId,
    displayName: p.displayName,
    company: p.company,
    position: p.position,
    headline: p.headline,
    bio: p.bio,
    categories: cats.map((c) => c.name),
    avatarUrl: p.avatarUrl,
    publicSlug: p.publicSlug,
    links: (p.links as unknown as { label: string; url: string }[]) ?? [],
    contractsCompleted: p.contractsCompleted,
    hoursLogged: Number(p.hoursLogged),
    followerCount,
    followingCount,
    isFollowing: Boolean(follow),
    isSelf,
    level: stats?.level ?? 1,
    xp: stats?.xp ?? 0,
    streak: stats?.streak ?? 0,
    achievements: awards.map((a) => ({ key: a.achievement.key, name: a.achievement.name, description: a.achievement.description, xp: a.achievement.xp, awardedAt: a.awardedAt.toISOString() })),
  }
}
