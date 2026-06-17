import { z } from 'zod'
import { router, vettedProcedure, publicProcedure } from '../../trpc/trpc'
import * as profile from './store'

// User-supplied URLs are rendered into the public profile — restrict to http(s) so a `javascript:`/`data:`
// scheme can't ride into an <a href> (z.url() alone accepts any scheme → stored XSS).
const httpUrl = (max = 500) => z.string().url().max(max).refine((u) => /^https?:\/\//i.test(u), { message: 'must be an http(s) URL' })

const linkSchema = z.object({ label: z.string().min(1).max(60), url: httpUrl() })

// Landing-page content blocks (the slim-Linktree builder). Discriminated on `type`; bounded everywhere.
const blockId = z.string().min(1).max(64)
const blockSchema = z.discriminatedUnion('type', [
  z.object({ id: blockId, type: z.literal('text'), heading: z.string().max(120).nullish(), body: z.string().min(1).max(2000) }),
  z.object({ id: blockId, type: z.literal('links'), title: z.string().max(120).nullish(), items: z.array(z.object({ label: z.string().min(1).max(80), url: httpUrl() })).min(1).max(15) }),
  z.object({ id: blockId, type: z.literal('image'), url: httpUrl(), alt: z.string().max(200).nullish(), caption: z.string().max(200).nullish() }),
  z.object({ id: blockId, type: z.literal('list'), title: z.string().max(120).nullish(), items: z.array(z.string().min(1).max(200)).min(1).max(20) }),
])

/** profile tRPC surface. Editor + onboarding = vetted contractor; get-public = anonymous (safe subset). */
export const profileRouter = router({
  getOwn: vettedProcedure.query(({ ctx }) => profile.getOwn(ctx.clerkUserId)),
  update: vettedProcedure
    .input(
      z.object({
        firstName: z.string().min(1).max(60).optional(),
        lastName: z.string().min(1).max(60).optional(),
        company: z.string().max(120).nullish(),
        position: z.string().max(120).nullish(),
        headline: z.string().max(140).nullish(),
        bio: z.string().max(2000).nullish(),
        avatarUrl: httpUrl().nullish(),
        links: z.array(linkSchema).max(10).optional(),
        blocks: z.array(blockSchema).max(20).optional(),
        categoryIds: z.array(z.string().uuid()).max(12).optional(),
        publicSlug: z.string().max(40).nullish(), // the store trims/lowercases + validates SLUG_RE; empty clears it
        ratePublic: z.number().int().min(0).max(100000).nullish(),
        location: z.string().max(120).nullish(),
      }),
    )
    .mutation(({ ctx, input }) => profile.update(ctx.clerkUserId, input)),
  setAvailability: vettedProcedure
    .input(z.object({ acceptingWork: z.boolean().optional(), capacityHours: z.number().int().min(0).max(168).nullish(), awayUntil: z.string().datetime().nullish() }))
    .mutation(({ ctx, input }) => profile.setAvailability(ctx.clerkUserId, input)),
  setPublic: vettedProcedure.input(z.object({ isPublic: z.boolean() })).mutation(({ ctx, input }) => profile.setPublic(ctx.clerkUserId, input.isPublic)),
  setSearchable: vettedProcedure.input(z.object({ searchable: z.boolean() })).mutation(({ ctx, input }) => profile.setSearchable(ctx.clerkUserId, input.searchable)),
  exportData: vettedProcedure.query(({ ctx }) => profile.exportData(ctx.clerkUserId)),
  checkSlug: vettedProcedure.input(z.object({ slug: z.string().min(1) })).query(({ ctx, input }) => profile.checkSlug(ctx.clerkUserId, input.slug)),
  acceptDoc: vettedProcedure.input(z.object({ docKey: z.string().min(1), version: z.string().optional() })).mutation(({ ctx, input }) => profile.acceptDoc(ctx.clerkUserId, input.docKey, input.version)),
  completeOnboarding: vettedProcedure.mutation(({ ctx }) => profile.completeOnboarding(ctx.clerkUserId)),
  listCategories: vettedProcedure.query(() => profile.listCategories()),
  getPublic: publicProcedure.input(z.object({ slug: z.string().min(1) })).query(({ input }) => profile.getPublic(input.slug)),
  publicSitemap: publicProcedure.query(() => profile.listPublicSlugs()),
})
