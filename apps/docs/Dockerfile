# syntax=docker/dockerfile:1
#
# @matura/docs — static, wallet-free documentation site (docs.usematura.xyz).
# Build context = repo ROOT (EasyPanel: Build Path = repo root, Dockerfile = apps/docs/Dockerfile).
#
# 3 stages via `turbo prune --docker`:
#   pruner  — carve out only what @matura/docs needs (pruned lockfile + sources)
#   builder — pnpm install (frozen) → next build (output: "standalone", mirrors repo docs + manifest)
#   runner  — slim, non-root; ships only the traced standalone server
#
# node:24-slim (Debian/glibc) on BOTH stages — matches the repo's even-LTS Node pin (<25).

FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app

# ---- pruner: produce out/json (pruned manifests + lockfile) and out/full (pruned sources) ----
FROM base AS pruner
COPY . .
RUN npx --yes turbo@2.11.3 prune @matura/docs --docker

# ---- builder: install against the pruned lockfile, then build ----
FROM base AS builder
# Manifests first so `pnpm install` is cached until a dependency actually changes.
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .

# The reference-docs prebuild (`apps/docs` prebuild step) reads repo-root `docs/*.md` and the chain
# deployment manifest to generate the Reference section + the deployed-addresses table. `turbo prune`
# does NOT include these in the pruned sources, so copy them explicitly from the build context (repo
# root). They are build-time-only inputs — never bundled into the runtime image.
COPY docs ./docs
COPY packages/chain/src/deployments ./packages/chain/src/deployments

# NEXT_PUBLIC_* are inlined at build time (Next) — must be present BEFORE `next build`.
# Docs only needs cross-domain URLs for canonical/OG + nav links; NO wallet/chain/secret vars.
ARG NEXT_PUBLIC_DOCS_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_LANDING_URL
ENV NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_LANDING_URL=$NEXT_PUBLIC_LANDING_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@matura/docs

# ---- runner: slim, non-root; standalone server only ----
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3003 \
    HOSTNAME=0.0.0.0
RUN useradd --system --uid 1001 --create-home nextjs
USER nextjs

# outputFileTracingRoot=repo root → standalone mirrors the monorepo layout under /app.
COPY --from=builder --chown=nextjs:nextjs /app/apps/docs/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/apps/docs/.next/static ./apps/docs/.next/static
COPY --from=builder --chown=nextjs:nextjs /app/apps/docs/public ./apps/docs/public

EXPOSE 3003
CMD ["node", "apps/docs/server.js"]
