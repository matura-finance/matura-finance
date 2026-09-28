# syntax=docker/dockerfile:1
#
# @matura/api — orchestration + read-model service AND the indexer worker.
# ONE image, ONE Dockerfile, role selected at RUNTIME by the SERVICE_ROLE env var (so a platform
# like EasyPanel needs no per-service command override — both services point at THIS Dockerfile):
#   SERVICE_ROLE unset/"api" → node apps/api/dist/main.js    (HTTP API + real HEALTHCHECK)
#   SERVICE_ROLE="worker"    → node apps/api/dist/worker.js   (headless indexer; HEALTHCHECK no-ops)
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

# `turbo run build` builds @matura/chain first (task graph), then runs @matura/api's build
# script (`prisma generate && nest build`). `prisma generate` therefore runs INSIDE the linux
# container — emitting the correct glibc query engine into apps/api/src/generated/prisma (not
# the host's darwin engine) — and nest-cli `assets` copies that engine into dist/generated/prisma
# so `node dist/main.js` resolves it without depending on the src tree layout.
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
# Liveness only (never /health/ready — that gates on indexer catch-up and would restart-loop during
# reindex). Role-aware: the WORKER shares this image but has NO HTTP server, so its probe short-
# circuits to success when SERVICE_ROLE=worker; the API keeps the real HTTP check. Node built-in fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "if(process.env.SERVICE_ROLE==='worker')process.exit(0);fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Role selected at runtime: SERVICE_ROLE=worker → indexer worker; otherwise the HTTP API.
CMD ["sh", "-c", "if [ \"$SERVICE_ROLE\" = worker ]; then exec node apps/api/dist/worker.js; else exec node apps/api/dist/main.js; fi"]
