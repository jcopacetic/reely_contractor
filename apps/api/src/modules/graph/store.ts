/**
 * graph store — the contractor social graph: follow edges + the in-club profile view. Follows are a simple
 * directed edge (follower → followee), unique per pair, no self-follow. `getClubProfile` is the authenticated
 * profile a contractor sees of another (full profile + follower/following counts + their own follow state) —
 * distinct from the anonymous public `/pro/[slug]` safe-subset.
 */
import { prisma } from '@contractor/db'

/** Toggle a follow edge. Returns the new state + the followee's follower count. */
export async function toggleFollow(followerUserId: string, followeeUserId: string): Promise<{ following: boolean; followerCount: number } | { error: string }> {
  if (followerUserId === followeeUserId) return { error: 'self' }
  const existing = await prisma.follow.findUnique({ where: { followerUserId_followeeUserId: { followerUserId, followeeUserId } }, select: { id: true } })
  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } })
  } else {
    await prisma.follow.create({ data: { followerUserId, followeeUserId } })
    await prisma.appEvent.create({ data: { source: 'graph', type: 'follow.created', actorId: followerUserId, actorType: 'contractor', payload: { followeeUserId } } })
  }
  const followerCount = await prisma.follow.count({ where: { followeeUserId } })
  return { following: !existing, followerCount }
}

type ClubProfile = {
  userId: string
  displayName: string
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
}

/** The authenticated in-club profile of `targetUserId`, as seen by `viewerUserId`. Null if no profile. */
export async function getClubProfile(viewerUserId: string, targetUserId: string): Promise<ClubProfile | null> {
  const p = await prisma.contractorProfile.findUnique({ where: { clerkUserId: targetUserId } })
  if (!p) return null
  const ids = (p.categoryIds as unknown as string[]) ?? []
  const isSelf = viewerUserId === targetUserId
  const [cats, followerCount, followingCount, follow] = await Promise.all([
    ids.length ? prisma.skillCategory.findMany({ where: { id: { in: ids } }, select: { name: true } }) : Promise.resolve([] as { name: string }[]),
    prisma.follow.count({ where: { followeeUserId: targetUserId } }),
    prisma.follow.count({ where: { followerUserId: targetUserId } }),
    isSelf ? Promise.resolve(null) : prisma.follow.findUnique({ where: { followerUserId_followeeUserId: { followerUserId: viewerUserId, followeeUserId: targetUserId } }, select: { id: true } }),
  ])
  return {
    userId: targetUserId,
    displayName: p.displayName,
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
  }
}
