# @contractor/ui

Shared UI primitives for the Contractor web app — Tailwind (v4) + Lucide icons, built on
`class-variance-authority` + `clsx` + `tailwind-merge`.

## Exports
- `.` — the component barrel (`src/index.ts`, components under `src/components/`).
- `./cn` — the `cn()` class-merge helper (`src/lib/cn.ts`).
- `./globals.css` — the shared Tailwind base (`src/styles/globals.css`), imported by `@contractor/web`.

React 19 is a peer dependency (provided by the consuming app).

## Dev
```bash
pnpm --filter @contractor/ui typecheck
```
No build step — consumed as source by `@contractor/web` (turborepo workspace `workspace:*`).
