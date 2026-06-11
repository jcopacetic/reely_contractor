/**
 * feed store — the contractor social club feed: posts + reactions. v1 is a single club-wide feed (the club
 * is small + exclusive) ordered newest-first; follower-scoping is a later enhancement. Reactions are
 * one-per-(user,post), changeable (re-reacting the same type clears it) — lifted from Stumble's pattern,
 * with `post.reaction_count` maintained as a delta. Posts feed `app_event` (post.created) for achievements.
 */
import { prisma, type ReactionType } from '@contractor/db'

export const REACTIONS = ['like', 'celebrate', 'insightful', 'fire', 'support'] as const

type Author = { userId: string; displayName: string; avatarUrl: string | null; publicSlug: string | null }
export type FeedPost = {
  id: string
  author: Author
  body: string
  kind: string
  createdAt: string
  reactionCount: number
  commentCount: number
  myReaction: ReactionType | null
}

/** Create a post; bump the author's post count; emit post.created (for achievements). */
export async function createPost(userId: string, body: string, kind: 'update' | 'milestone' | 'achievement' = 'update') {
  const post = await prisma.post.create({ data: { authorUserId: userId, body: body.trim(), kind } })
  await prisma.contractorStats.upsert({
    where: { clerkUserId: userId },
    update: { postCount: { increment: 1 } },
    create: { clerkUserId: userId, postCount: 1 },
  })
  await prisma.appEvent.create({ data: { source: 'feed', type: 'post.created', actorId: userId, actorType: 'contractor', payload: { postId: post.id } } })
  return { id: post.id }
}

/** Newest-first club feed with author profile + the caller's own reaction per post. Keyset on createdAt. */
export async function listFeed(userId: string, limit = 30, before?: string): Promise<FeedPost[]> {
  const posts = await prisma.post.findMany({
    where: before ? { createdAt: { lt: new Date(before) } } : {},
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 50),
    select: { id: true, authorUserId: true, body: true, kind: true, reactionCount: true, commentCount: true, createdAt: true },
  })
  if (posts.length === 0) return []

  const authorIds = [...new Set(posts.map((p) => p.authorUserId))]
  const postIds = posts.map((p) => p.id)
  const [profiles, mine] = await Promise.all([
    prisma.contractorProfile.findMany({ where: { clerkUserId: { in: authorIds } }, select: { clerkUserId: true, displayName: true, avatarUrl: true, publicSlug: true } }),
    prisma.reaction.findMany({ where: { userId, postId: { in: postIds } }, select: { postId: true, type: true } }),
  ])
  const byUser = new Map(profiles.map((p) => [p.clerkUserId, p]))
  const myByPost = new Map(mine.map((r) => [r.postId, r.type]))

  return posts.map((p) => {
    const pr = byUser.get(p.authorUserId)
    return {
      id: p.id,
      author: { userId: p.authorUserId, displayName: pr?.displayName ?? 'Contractor', avatarUrl: pr?.avatarUrl ?? null, publicSlug: pr?.publicSlug ?? null },
      body: p.body,
      kind: p.kind,
      createdAt: p.createdAt.toISOString(),
      reactionCount: p.reactionCount,
      commentCount: p.commentCount,
      myReaction: myByPost.get(p.id) ?? null,
    }
  })
}

/** Toggle/switch a reaction on a post (one per user per post). Maintains post.reaction_count. */
export async function react(userId: string, postId: string, type: ReactionType): Promise<{ myReaction: ReactionType | null; reactionCount: number }> {
  const existing = await prisma.reaction.findUnique({ where: { userId_postId: { userId, postId } }, select: { id: true, type: true } })

  let delta = 0
  let myReaction: ReactionType | null = type
  if (!existing) {
    await prisma.reaction.create({ data: { userId, postId, type } })
    delta = 1
  } else if (existing.type === type) {
    await prisma.reaction.delete({ where: { id: existing.id } })
    delta = -1
    myReaction = null
  } else {
    await prisma.reaction.update({ where: { id: existing.id }, data: { type } })
  }

  const post = delta === 0
    ? await prisma.post.findUnique({ where: { id: postId }, select: { reactionCount: true } })
    : await prisma.post.update({ where: { id: postId }, data: { reactionCount: { increment: delta } }, select: { reactionCount: true } })
  return { myReaction, reactionCount: post?.reactionCount ?? 0 }
}
