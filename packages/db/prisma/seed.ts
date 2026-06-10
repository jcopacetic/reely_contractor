/**
 * Seed the curated skill-category vocabulary + the baseline achievement definitions. Idempotent (upsert by
 * unique key). Run: `pnpm --filter @contractor/db seed`. The skill_category vocab is the job↔contractor match
 * key (Board listings + contractor profiles both carry category_ids); admin manages it post-seed.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const CATEGORIES: { name: string; slug: string; order: number }[] = [
  { name: 'Web Development', slug: 'web-development', order: 10 },
  { name: 'Mobile Development', slug: 'mobile-development', order: 20 },
  { name: 'UI/UX Design', slug: 'ui-ux-design', order: 30 },
  { name: 'Brand & Graphic Design', slug: 'brand-graphic-design', order: 40 },
  { name: 'Content & Copywriting', slug: 'content-copywriting', order: 50 },
  { name: 'SEO & Growth', slug: 'seo-growth', order: 60 },
  { name: 'Paid Media', slug: 'paid-media', order: 70 },
  { name: 'Data & Analytics', slug: 'data-analytics', order: 80 },
  { name: 'DevOps & Infrastructure', slug: 'devops-infrastructure', order: 90 },
  { name: 'AI & Automation', slug: 'ai-automation', order: 100 },
  { name: 'Video & Motion', slug: 'video-motion', order: 110 },
  { name: 'Project Management', slug: 'project-management', order: 120 },
]

const ACHIEVEMENTS: { key: string; name: string; description: string; xp: number; order: number }[] = [
  { key: 'welcomed', name: 'Welcomed', description: 'Completed onboarding and joined the club.', xp: 50, order: 10 },
  { key: 'first_post', name: 'First Post', description: 'Shared your first post.', xp: 25, order: 20 },
  { key: 'connector', name: 'Connector', description: 'Followed 5 fellow contractors.', xp: 25, order: 30 },
  { key: 'conversationalist', name: 'Conversationalist', description: 'Left 10 comments.', xp: 30, order: 40 },
  { key: 'first_contract', name: 'First Contract', description: 'Signed your first contract.', xp: 100, order: 50 },
  { key: 'on_the_clock', name: 'On the Clock', description: 'Logged your first approved hour.', xp: 50, order: 60 },
]

async function main() {
  for (const c of CATEGORIES) {
    await prisma.skillCategory.upsert({ where: { slug: c.slug }, update: { name: c.name, order: c.order }, create: c })
  }
  for (const a of ACHIEVEMENTS) {
    await prisma.achievement.upsert({ where: { key: a.key }, update: { name: a.name, description: a.description, xp: a.xp, order: a.order }, create: a })
  }
  console.log(`Seeded ${CATEGORIES.length} skill categories + ${ACHIEVEMENTS.length} achievements.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
