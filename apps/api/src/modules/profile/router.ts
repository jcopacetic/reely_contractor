import { z } from 'zod'
import { router, vettedProcedure, publicProcedure } from '../../trpc/trpc'
import * as profile from './store'

const linkSchema = z.object({ label: z.string().min(1).max(60), url: z.string().url() })

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
        avatarUrl: z.string().url().nullish(),
        links: z.array(linkSchema).max(10).optional(),
        categoryIds: z.array(z.string().uuid()).max(12).optional(),
      }),
    )
    .mutation(({ ctx, input }) => profile.update(ctx.clerkUserId, input)),
  setPublic: vettedProcedure.input(z.object({ isPublic: z.boolean() })).mutation(({ ctx, input }) => profile.setPublic(ctx.clerkUserId, input.isPublic)),
  checkSlug: vettedProcedure.input(z.object({ slug: z.string().min(1) })).query(({ ctx, input }) => profile.checkSlug(ctx.clerkUserId, input.slug)),
  acceptDoc: vettedProcedure.input(z.object({ docKey: z.string().min(1), version: z.string().optional() })).mutation(({ ctx, input }) => profile.acceptDoc(ctx.clerkUserId, input.docKey, input.version)),
  completeOnboarding: vettedProcedure.mutation(({ ctx }) => profile.completeOnboarding(ctx.clerkUserId)),
  listCategories: vettedProcedure.query(() => profile.listCategories()),
  getPublic: publicProcedure.input(z.object({ slug: z.string().min(1) })).query(({ input }) => profile.getPublic(input.slug)),
  publicSitemap: publicProcedure.query(() => profile.listPublicSlugs()),
})
