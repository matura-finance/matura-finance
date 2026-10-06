# syntax=docker/dockerfile:1
#
# @matura/landing — static, wallet-free marketing site (usematura.xyz).
# Build context = repo ROOT (EasyPanel: Build Path = repo root, Dockerfile = apps/landing/Dockerfile).
#
# 3 stages via `turbo prune --docker`:
#   pruner  — carve out only what @matura/landing needs (pruned lockfile + sources)
#   builder — pnpm install (frozen) → next build (output: "standalone")
#   runner  — slim, non-root; ships only the traced standalone server
#
# node:24-slim (Debian/glibc) on BOTH stages — matches the repo's even-LTS Node pin (<25).

FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app

# ---- pruner: produce out/json (pruned manifests + lockfile) and out/full (pruned sources) ----
FROM base AS pruner
COPY . .
RUN npx --yes turbo@2.11.3 prune @matura/landing --docker

# ---- builder: install against the pruned lockfile, then build ----
FROM base AS builder
# Manifests first so `pnpm install` is cached until a dependency actually changes.
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .

# NEXT_PUBLIC_* are inlined at build time (Next) — must be present BEFORE `next build`.
# Landing only needs cross-domain URLs + the deploy flag; NO wallet/chain/secret vars.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_LANDING_URL
ARG NEXT_PUBLIC_DOCS_URL
ARG NEXT_PUBLIC_CONTRACTS_DEPLOYED
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_LANDING_URL=$NEXT_PUBLIC_LANDING_URL \
    NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL \
    NEXT_PUBLIC_CONTRACTS_DEPLOYED=$NEXT_PUBLIC_CONTRACTS_DEPLOYED \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@matura/landing

# ---- runner: slim, non-root; standalone server only ----
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0
RUN useradd --system --uid 1001 --create-home nextjs
USER nextjs

# outputFileTracingRoot=repo root → standalone mirrors the monorepo layout under /app.
COPY --from=builder --chown=nextjs:nextjs /app/apps/landing/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/apps/landing/.next/static ./apps/landing/.next/static
COPY --from=builder --chown=nextjs:nextjs /app/apps/landing/public ./apps/landing/public

EXPOSE 3001
CMD ["node", "apps/landing/server.js"]
