# syntax=docker/dockerfile:1
#
# @matura/api — orchestration + read-model service AND the indexer worker.
# ONE image, TWO start commands (do NOT build a second image):
#   API    → node apps/api/dist/main.js    (default CMD; HTTP + HEALTHCHECK)
#   worker → node apps/api/dist/worker.js   (override CMD; NO HTTP server, NO healthcheck)
#
# Build context = repo ROOT (EasyPanel: Build Path = repo root, Dockerfile = apps/api/Dockerfile).
# node:24-slim (Debian/glibc) on BOTH stages — Prisma engines need glibc (NOT alpine/musl).
#
# Migrations are a ONE-OFF release job, never run per-replica or at image build:
#   docker run --rm -e DATABASE_URL=... <image> pnpm --filter @matura/api migrate:deploy
# (runs `prisma migrate deploy`; gates BOTH api + worker; run exactly once per release).

FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app

# ---- pruner: produce out/json (pruned manifests + lockfile) and out/full (pruned sources) ----
FROM base AS pruner
COPY . .
RUN npx --yes turbo@2.11.3 prune @matura/api --docker

# ---- builder: install, generate the Prisma client (linux engine), build ----
FROM base AS builder
# openssl: Prisma query-engine runtime dependency on Debian slim.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Manifests first so `pnpm install` is cached until a dependency actually changes.
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .

# `prisma generate` runs INSIDE the linux container so the correct glibc query engine is
# emitted into apps/api/src/generated/prisma (not the host's darwin engine). `turbo run build`
# then builds @matura/chain first (task graph) before @matura/api's `nest build`.
RUN pnpm --filter @matura/api exec prisma generate
RUN pnpm turbo run build --filter=@matura/api

# ---- runner: slim, non-root; the pruned tree (node_modules + prisma engine + generated client + dist) ----
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000
# openssl for the Prisma engine at runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 1001 --create-home nodejs

# Nest apps are not tree-shaken like Next standalone — copy the built pruned workspace whole
# (keeps node_modules with the Prisma engines, the generated client under src/generated, and dist).
COPY --from=builder --chown=nodejs:nodejs /app ./
USER nodejs

EXPOSE 3000
# API liveness only (never /health/ready — that gates on indexer catch-up and would restart-loop
# during reindex). Uses Node's built-in fetch (no wget/curl needed).
# NOTE: the WORKER shares this image but has NO HTTP server — its service MUST disable this baked
# HEALTHCHECK (EasyPanel: no healthcheck / `docker run --no-healthcheck`) and rely on a process probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Default = API. Worker service overrides this CMD with: node apps/api/dist/worker.js
CMD ["node", "apps/api/dist/main.js"]
