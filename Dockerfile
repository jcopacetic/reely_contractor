# Backend image for the Contractor node — runs the api (Fastify + tRPC). The worker uses Dockerfile.worker;
# the web app deploys to Vercel, not this image.
#
# Why tsx (not `tsc` → node dist): this is a pnpm workspace where apps import workspace packages
# (@contractor/db, …) whose `main` is TS source. `node dist/index.js` can't resolve those at runtime, so we
# run the TS entrypoints with tsx.
FROM node:22-slim AS base
# openssl + ca-certificates are needed by Prisma's query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile

# Generate the Prisma client for the build platform (linux engine baked into the image).
RUN pnpm --filter @contractor/db generate

ENV NODE_ENV=production
# Default service = api. The worker service overrides this via RAILWAY_DOCKERFILE_PATH=Dockerfile.worker.
CMD ["pnpm", "--filter", "@contractor/api", "start:prod"]
