# @contractor/db

The Prisma client + schema for the Contractor node (USER-scoped, no tenant). A single shared client instance
(hot-reload safe in dev). Exposes `prisma`, `withUser`, `ensureIdentity`, the `DbActor` type, and re-exports
`@prisma/client`.

## Isolation model
There is no local User table — a `contractor_identity` is a verified layer on the base Clerk User. RLS keys on
two per-request Postgres GUCs:
- `app.actor_user` — the Clerk user id.
- `app.actor` — the role (`contractor` | `applicant` | `platform_admin` | `system`).

**`withUser(actor, fn)`** runs `fn` inside a transaction with those GUCs set (`set_config(..., true)` → scoped
to the txn) so RLS binds. The api maps its resolved request context to a `DbActor` via `actorFor` (in
`apps/api/src/trpc/trpc.ts`).

> **Honest status:** the module stores currently query the **bare `prisma` client directly** (not `withUser`),
> so the RLS policies in `prisma/rls.sql` are **defined but not actively enforced per-request** today. The
> app-layer guards in the stores are the real boundary; `withUser` + RLS is the backstop to be wired later.

## Prisma Migrate workflow (NOT `db push`)
Schema changes are committed versioned migrations under `prisma/migrations/`:
```bash
pnpm --filter @contractor/db generate         # prisma generate
pnpm --filter @contractor/db migrate          # prisma migrate dev (writes + applies a migration)
pnpm --filter @contractor/db migrate:deploy   # prisma migrate deploy (apply pending)
pnpm --filter @contractor/db migrate:status
pnpm --filter @contractor/db rls              # apply prisma/rls.sql (apply-rls.ts; splits on ';')
pnpm --filter @contractor/db seed             # skill categories + achievement definitions
```
- `0_init` is the **baseline** (the original schema) — NOT re-applied to the existing prod DB.
- `1_add_contractor_name_company_position` added the profile name/company/position columns.
- **Apply to prod** by running a migration's one `prisma/migrations/<name>/migration.sql` via the Supabase MCP
  (project `mgjhsihzhltemvkssbbg`); only post-baseline migrations are applied there.

`prisma/rls.sql` is the RLS baseline (admin/system catch-all + self/participant policies, idempotent
drop-if-exists, no `;` inside a statement / no `$$` bodies because `apply-rls.ts` splits on `;`). Each module
session hardens its own policy bodies per the manifest's acceptance criteria.
