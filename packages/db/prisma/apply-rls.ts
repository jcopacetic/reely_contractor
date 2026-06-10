/**
 * Applies prisma/rls.sql to the database. Idempotent (enable RLS is idempotent; policies use
 * `drop policy if exists … / create …`). Run after `prisma migrate`: `pnpm --filter @contractor/db rls`.
 *
 * rls.sql contains no `$$`-quoted bodies and no ';' inside any statement, so a naive split on ';' is safe.
 * Comment lines (-- …) are stripped first.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const here = dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

async function main() {
  const raw = readFileSync(join(here, 'rls.sql'), 'utf8')
  const sql = raw
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt)
  }
  console.log(`Applied ${statements.length} RLS statements.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
