import { describe, it, expect } from 'vitest'
import type { ReactionType } from '@contractor/db'
import { reactionTransition, mapPost, type FeedPost } from './store'

/**
 * UNIT tests for the PURE logic in feed/store.ts. No DB / network: we only call
 * reactionTransition (the toggle/switch delta + state decision extracted from react())
 * and mapPost (the raw-post → FeedPost view-mapper extracted from hydrate()'s .map).
 * Importing the module is safe — prisma instantiates lazily and the DB-querying
 * functions (react/hydrate/listFeed/…) are never called here; those are e2e-covered.
 *
 * Determinism: every Date comes from a fixed ISO string literal; no clock / randomness.
 */

const ISO = '2026-06-15T12:30:00.000Z'

// Minimal raw-post fixture matching store.ts's internal RawPost shape.
function rawPost(over: Partial<Parameters<typeof mapPost>[0]> = {}): Parameters<typeof mapPost>[0] {
  return {
    id: 'post_1',
    authorUserId: 'user_author',
    body: 'hello club',
    kind: 'update',
    linkUrl: null,
    linkLabel: null,
    reactionCount: 0,
    commentCount: 0,
    createdAt: new Date(ISO),
    ...over,
  }
}

describe('reactionTransition (pure toggle/switch decision)', () => {
  it('none → type: creates, delta +1, myReaction = type', () => {
    expect(reactionTransition(null, 'like')).toEqual({ op: 'create', delta: 1, myReaction: 'like' })
  })

  it('same type → removes: deletes, delta -1, myReaction = null', () => {
    expect(reactionTransition('like', 'like')).toEqual({ op: 'delete', delta: -1, myReaction: null })
  })

  it('different type → switches: updates, delta 0, myReaction = new type', () => {
    expect(reactionTransition('like', 'fire')).toEqual({ op: 'update', delta: 0, myReaction: 'fire' })
  })

  it('delta is exactly +1 / -1 / 0 across the three transitions (count-maintenance contract)', () => {
    expect(reactionTransition(null, 'support').delta).toBe(1)
    expect(reactionTransition('support', 'support').delta).toBe(-1)
    expect(reactionTransition('support', 'celebrate').delta).toBe(0)
  })

  it('myReaction state derivation: add/switch yield the applied type, remove yields null', () => {
    expect(reactionTransition(null, 'insightful').myReaction).toBe('insightful')
    expect(reactionTransition('insightful', 'insightful').myReaction).toBeNull()
    expect(reactionTransition('like', 'insightful').myReaction).toBe('insightful')
  })

  it('every reaction type self-removes (same→same is always a -1 delete) and clears state', () => {
    const all: ReactionType[] = ['like', 'celebrate', 'insightful', 'fire', 'support']
    for (const t of all) {
      expect(reactionTransition(t, t)).toEqual({ op: 'delete', delta: -1, myReaction: null })
    }
  })

  it('switches between every distinct pair are delta-0 updates to the new type', () => {
    const all: ReactionType[] = ['like', 'celebrate', 'insightful', 'fire', 'support']
    for (const from of all) {
      for (const to of all) {
        if (from === to) continue
        expect(reactionTransition(from, to)).toEqual({ op: 'update', delta: 0, myReaction: to })
      }
    }
  })
})

describe('mapPost (pure raw-post → FeedPost view-mapper)', () => {
  const emptyProfiles = new Map<string, { displayName: string; avatarUrl: string | null; publicSlug: string | null }>()
  const emptyReactions = new Map<string, ReactionType>()

  it('resolves a present author profile onto the post author', () => {
    const profiles = new Map([
      ['user_author', { displayName: 'Ada', avatarUrl: 'https://x/a.png', publicSlug: 'ada' }],
    ])
    const out = mapPost(rawPost(), profiles, emptyReactions)
    expect(out.author).toEqual({ userId: 'user_author', displayName: 'Ada', avatarUrl: 'https://x/a.png', publicSlug: 'ada' })
  })

  it('falls back to the "Contractor" placeholder + nulls when the author profile is MISSING', () => {
    const out = mapPost(rawPost(), emptyProfiles, emptyReactions)
    expect(out.author).toEqual({ userId: 'user_author', displayName: 'Contractor', avatarUrl: null, publicSlug: null })
  })

  it('uses the partial profile fields it has (each ?? fallback is per-field)', () => {
    // A profile present but with null avatar/slug keeps those nulls (not the placeholder name).
    const profiles = new Map([
      ['user_author', { displayName: 'Grace', avatarUrl: null, publicSlug: null }],
    ])
    const out = mapPost(rawPost(), profiles, emptyReactions)
    expect(out.author.displayName).toBe('Grace')
    expect(out.author.avatarUrl).toBeNull()
    expect(out.author.publicSlug).toBeNull()
  })

  it('attaches the viewer reaction for this post when present', () => {
    const mine = new Map<string, ReactionType>([['post_1', 'fire']])
    expect(mapPost(rawPost(), emptyProfiles, mine).myReaction).toBe('fire')
  })

  it('myReaction is null when the viewer has no reaction on this post', () => {
    // A reaction keyed to a DIFFERENT post must not bleed onto this one.
    const mine = new Map<string, ReactionType>([['post_other', 'like']])
    expect(mapPost(rawPost({ id: 'post_1' }), emptyProfiles, mine).myReaction).toBeNull()
  })

  it('serializes createdAt to a deterministic ISO string', () => {
    expect(mapPost(rawPost(), emptyProfiles, emptyReactions).createdAt).toBe(ISO)
  })

  it('passes through scalar fields verbatim (body/kind/link/counts)', () => {
    const out = mapPost(
      rawPost({ body: 'shipped v2', kind: 'milestone', linkUrl: 'https://l', linkLabel: 'PR', reactionCount: 7, commentCount: 3 }),
      emptyProfiles,
      emptyReactions,
    )
    expect(out).toMatchObject({ id: 'post_1', body: 'shipped v2', kind: 'milestone', linkUrl: 'https://l', linkLabel: 'PR', reactionCount: 7, commentCount: 3 })
  })

  it('mapping a batch over a shared lookup resolves each post independently (mixed present/missing/own-reaction)', () => {
    const profiles = new Map([
      ['user_a', { displayName: 'Ada', avatarUrl: null, publicSlug: 'ada' }],
    ])
    const mine = new Map<string, ReactionType>([['p1', 'like']])
    const batch = [
      rawPost({ id: 'p1', authorUserId: 'user_a' }), // profile present + own reaction
      rawPost({ id: 'p2', authorUserId: 'user_b' }), // profile missing + no reaction
    ]
    const [first, second]: FeedPost[] = batch.map((p) => mapPost(p, profiles, mine))
    expect(first?.author.displayName).toBe('Ada')
    expect(first?.myReaction).toBe('like')
    expect(second?.author.displayName).toBe('Contractor')
    expect(second?.myReaction).toBeNull()
  })
})
