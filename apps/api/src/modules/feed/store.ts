/**
 * feed store — the contractor social club feed: posts + reactions. v1 is a single club-wide feed (the club
 * is small + exclusive) ordered newest-first; follower-scoping is a later enhancement. Reactions are
 * one-per-(user,post), changeable (re-reacting the same type clears it) — lifted from Stumble's pattern,
 * with `post.reaction_count` maintained as a delta. Posts feed `app_event` (post.created) for achievements.
 */
import { prisma, type ReactionType } from '@contractor/db'
import { emit } from '../../events'

export const REACTIONS = ['like', 'celebrate', 'insightful', 'fire', 'support'] as const

type Author = { userId: string; displayName: string; avatarUrl: string | null; publicSlug: string | null }
export type FeedPost = {
  id: string
  author: Author
  body: string
  kind: string
  linkUrl: string | null
  linkLabel: string | null
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
  await emit('feed', 'post.created', userId, { postId: post.id })
  return { id: post.id }
}

type RawPost = { id: string; authorUserId: string; body: string; kind: string; linkUrl: string | null; linkLabel: string | null; reactionCount: number; commentCount: number; createdAt: Date }
const POST_SELECT = { id: true, authorUserId: true, body: true, kind: true, linkUrl: true, linkLabel: true, reactionCount: true, commentCount: true, createdAt: true } as const

/** Resolve author profiles + the viewer's own reactions for a batch of raw posts → FeedPost[]. */
async function hydrate(viewerUserId: string, posts: RawPost[]): Promise<FeedPost[]> {
  if (posts.length === 0) return []
  const authorIds = [...new Set(posts.map((p) => p.authorUserId))]
  const postIds = posts.map((p) => p.id)
  const [profiles, mine] = await Promise.all([
    prisma.contractorProfile.findMany({ where: { clerkUserId: { in: authorIds } }, select: { clerkUserId: true, displayName: true, avatarUrl: true, publicSlug: true } }),
    prisma.reaction.findMany({ where: { userId: viewerUserId, postId: { in: postIds } }, select: { postId: true, type: true } }),
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
      linkUrl: p.linkUrl,
      linkLabel: p.linkLabel,
      createdAt: p.createdAt.toISOString(),
      reactionCount: p.reactionCount,
      commentCount: p.commentCount,
      myReaction: myByPost.get(p.id) ?? null,
    }
  })
}

/** Newest-first club feed (keyset on createdAt) with author profile + the caller's reaction per post. */
export async function listFeed(userId: string, limit = 30, before?: string): Promise<FeedPost[]> {
  const posts = await prisma.post.findMany({
    where: before ? { createdAt: { lt: new Date(before) } } : {},
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 50),
    select: POST_SELECT,
  })
  return hydrate(userId, posts)
}

/** A single contractor's posts (their profile timeline), newest-first. */
export async function listByAuthor(userId: string, authorUserId: string, limit = 30, before?: string): Promise<FeedPost[]> {
  const posts = await prisma.post.findMany({
    where: { authorUserId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 50),
    select: POST_SELECT,
  })
  return hydrate(userId, posts)
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

// ── Comments (threaded via parent_id) ──────────────────────────────────────────
export type CommentView = {
  id: string
  parentId: string | null
  author: Author
  body: string
  createdAt: string
}

/** Add a comment (or a reply, via parentId) to a post; maintain post.comment_count; emit comment.created. */
export async function addComment(userId: string, postId: string, body: string, parentId?: string): Promise<{ id: string }> {
  const c = await prisma.comment.create({ data: { postId, userId, body: body.trim(), parentId: parentId ?? null } })
  await prisma.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } })
  await emit('feed', 'comment.created', userId, { postId, commentId: c.id })
  return { id: c.id }
}

/**
 * Comments on a post (oldest-first, flat with parentId — the client threads them) + author profiles.
 * Bounded (take 100) with simple createdAt keyset pagination (`after` = last seen createdAt) so a
 * runaway thread can't load an unbounded set into memory.
 */
export async function listComments(postId: string, limit = 100, after?: string): Promise<CommentView[]> {
  const comments = await prisma.comment.findMany({
    where: { postId, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
    orderBy: { createdAt: 'asc' },
    take: Math.min(limit, 100),
    select: { id: true, userId: true, parentId: true, body: true, createdAt: true },
  })
  if (comments.length === 0) return []
  const authorIds = [...new Set(comments.map((c) => c.userId))]
  const profiles = await prisma.contractorProfile.findMany({ where: { clerkUserId: { in: authorIds } }, select: { clerkUserId: true, displayName: true, avatarUrl: true, publicSlug: true } })
  const byUser = new Map(profiles.map((p) => [p.clerkUserId, p]))
  return comments.map((c) => {
    const pr = byUser.get(c.userId)
    return {
      id: c.id,
      parentId: c.parentId,
      author: { userId: c.userId, displayName: pr?.displayName ?? 'Contractor', avatarUrl: pr?.avatarUrl ?? null, publicSlug: pr?.publicSlug ?? null },
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    }
  })
}
