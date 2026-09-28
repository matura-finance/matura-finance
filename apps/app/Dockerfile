# syntax=docker/dockerfile:1
#
# @matura/app — wallet-connected product (app.usematura.xyz).
# Build context = repo ROOT (EasyPanel: Build Path = repo root, Dockerfile = apps/app/Dockerfile).
#
# 3 stages via `turbo prune --docker`:
#   pruner  — carve out only what @matura/app needs (pruned lockfile + sources)
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
RUN npx --yes turbo@2.11.3 prune @matura/app --docker

# ---- builder: install against the pruned lockfile, then build ----
FROM base AS builder
# Manifests first so `pnpm install` is cached until a dependency actually changes.
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .

# NEXT_PUBLIC_* are inlined at build time (Next) AND derive the CSP `connect-src`
# (apiOrigin/rpcOrigin in next.config.ts) — they MUST be present BEFORE `next build`.
# Rebuild the image on any address/origin change. These are PUBLIC values only — never secrets.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_RPC_URL
ARG NEXT_PUBLIC_CHAIN_ID
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_LANDING_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL \
    NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_LANDING_URL=$NEXT_PUBLIC_LANDING_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@matura/app

# ---- runner: slim, non-root; standalone server only ----
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3002 \
    HOSTNAME=0.0.0.0
RUN useradd --system --uid 1001 --create-home nextjs
USER nextjs

# outputFileTracingRoot=repo root → standalone mirrors the monorepo layout under /app.
COPY --from=builder --chown=nextjs:nextjs /app/apps/app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/apps/app/.next/static ./apps/app/.next/static
COPY --from=builder --chown=nextjs:nextjs /app/apps/app/public ./apps/app/public

EXPOSE 3002
CMD ["node", "apps/app/server.js"]
