# Brainstorm: `apps/api` — Orchestration & Read-Model Service

- **Date:** 2026-09-26
- **Status:** Brainstorm — ready for `/workflows:plan`
- **Author:** arjunamarcelino
- **Related:** `docs/architecture.md`, `docs/decisions.md`,
  `docs/brainstorms/2026-09-25-deployment-seed-system-brainstorm.md`,
  `apps/api/prisma/schema.prisma` (the indexer contract), `packages/contracts/config/eip712.ts`

## What We're Building

The `apps/api` domain layer: a NestJS service that turns authoritative on-chain state
into fast read models and prepares (but never signs) user transactions. The chain owns
ownership, funding and settlement; PostgreSQL is a query projection and audit
convenience. Two runtime entrypoints share one codebase and one database:

1. **An indexer worker** (separate process) that polls BSC-Testnet / local Hardhat for
   protocol events behind a confirmation depth, upserts idempotent projections keyed by
   `(txHash, logIndex)`, and advances a reorg-safe `ChainCursor` only after each DB
   transaction commits.
2. **The API process** that serves read endpoints (account/portfolio, claims, vaults,
   executions, activity, settlements) from those projections, and write-**preparation**
   endpoints that return typed EIP-712 data and unsigned calldata (`to`, `data`, `value`,
   `chainId`, verifying contract, expiry/nonce, human summary) for the user's wallet to
   sign client-side.

**Scope of this build:** the full slice **minus the routing optimizer** — indexer, all
read endpoints, all prepare endpoints, SIWE auth, and health. `RoutingModule` ships as a
scaffold/stub; its optimizer arrives in "Prompt 5."

**Outcome:** after `demo:local` seeds Alice's three `ELIGIBLE` claims, starting the
indexer makes them visible through `GET /api/v1/account/:wallet`; restarting the indexer
never duplicates rows; prepare endpoints return wallet-signable payloads; lint, typecheck
and tests pass.

## Non-Goals (this build)

- **No private-key custody.** The API prepares typed data and unsigned calldata; the
  user's wallet signs client-side. The only server-side key is the isolated, prod-rejected
  issuer demo signer.
- **No routing optimizer.** RoutingModule is a stub; the leg-selection optimizer is Prompt 5.
- **No on-chain writes from the API.** No broadcasting, relaying, or gas sponsorship — every
  mutation returns a payload for the user to submit.
- **No email/password auth.** Wallet authorization is SIWE-only.
- **No new authoritative state.** Postgres is a projection/audit convenience; the chain
  remains the source of truth. The API never treats a projection as authoritative for a write.

## Why This Approach

The scaffold already commits the hard architectural choices, so we extend rather than
invent. Present and reused as-is: NestJS 11 (CJS + Jest), global `ZodValidationPipe` /
`ThrottlerModule` (100/60s) / `AllExceptionsFilter` envelope, `ConfigModule` (Zod env),
`PrismaModule`, URI versioning (`/api/v1`), dev-only Swagger. The **Prisma projection
schema is already written against the event shapes** (`ClaimProjection`,
`RouteExecution`/`RouteLegProjection`, `IssuerProjection`, `UserWallet`, `ChainCursor`
with block hash; every row carries `[txHash, logIndex]` unique keys). The `@matura/shared`
Zod domain schemas (`Claim`, `ExecutionRoute`, `SettlementReceipt`, `Issuer`,
`VaultSummary`, `Quote`) become the response DTOs directly — no parallel DTO layer.

A **separate worker process** keeps indexer load off the API request path and lets the
API's readiness gate on cursor freshness rather than owning the poll loop. Preparation-only
write endpoints honor the non-custodial boundary: the API composes calldata and typed data
but the private key never touches the server (except the isolated, prod-rejected issuer
demo signer). Money stays decimal base-unit **strings** and dates ISO-8601 at every JSON
boundary; BigInt is converted safely on the way out.

## Key Decisions

1. **Full slice now, routing optimizer deferred.** All modules land except
   `RoutingModule`'s optimizer, which is a stub returning "not implemented" (or a trivial
   passthrough) until Prompt 5. `ExecutionsModule` prepare can still assemble a route from
   a caller-supplied leg set so the pipeline is exercised end-to-end.
2. **Indexer runs as a separate worker process.** Same codebase, own entrypoint (a Nest
   standalone app / CLI bootstrap). API and worker share the Postgres projection DB. The
   API's `HealthModule` readiness checks DB + RPC and treats a stale `ChainCursor` (last
   processed block too far behind head) as degraded. `apps/api` gains a `@matura/chain`
   dependency for manifests/ABIs/clients — consumed via a new tsup dual CJS/ESM build on
   `@matura/chain` (Resolved Decision 1).
3. **Reorg strategy: confirmation lag + hash-check rewind.** Index only up to
   `head − CONFIRMATIONS`. Each poll, re-fetch the stored cursor block and compare its hash
   to `ChainCursor.lastProcessedBlockHash`; on mismatch, rewind a fixed `REWIND_WINDOW`
   (≈ 2× confirmations) and replay. Replay is safe because every upsert is keyed by
   `(txHash, logIndex)`. Cursor advances **only after** the projection write commits, in
   the same DB transaction.
4. **Events consumed → projections:** `ClaimRegistered`, `ClaimStateChanged`,
   `ClaimSliceReserved` (+ `ClaimSliceReleased`) → `ClaimProjection`; `RouteExecuted` +
   `RouteLegExecuted` → `RouteExecution`/`RouteLegProjection`; `ClaimSettled`
   (+ `AllocationRegistered`) → settlement projection; issuer/vault registry events →
   `IssuerProjection` / vault read model. Note the `RouteExecution.targetAdvance` schema
   field is **not** in the `RouteExecuted` event (event emits `totalAdvance/…`) — reconcile
   by decoding the `route()` tx calldata (Resolved Decision 2).
5. **Auth: SIWE (EIP-4361) with stateless JWT + DB nonce.** `GET nonce` inserts a
   single-use `AuthNonce` row; `POST verify` checks the SIWE message + signature with viem,
   consumes the nonce, and mints a short-lived signed JWT carrying the wallet. Prepare
   endpoints verify the JWT → `req.wallet`, and reject when the JWT wallet ≠ the path
   wallet. No email/password. New Prisma model: `AuthNonce` (migration committed).
6. **EIP-712 typed data relocates to `@matura/shared`.** `CLAIM_ATTESTATION_TYPES`,
   `EXECUTION_ROUTE_TYPES`, and the domain constants move from
   `packages/contracts/config` into framework-free `@matura/shared`; contracts and api both
   import from there. Preserves the "contracts has no `@matura/*` deps" boundary and gives
   the API one source of truth for typed data. Parity/typehash tests must follow the move.
7. **Preparation response contract (uniform).** Every write-prepare endpoint returns
   `{ chainId, verifyingContract, to, data, value, expiry|deadline, nonce, typedData?,
   summary }` — a human-readable summary plus everything a wallet needs to sign. Amounts as
   strings, no floats, no BigInt leaks.
8. **Issuer demo signing is isolated and prod-rejected.** `POST /issuer/attestations/prepare`
   returns typed data for an external signer by default; only when
   `DEMO_ISSUER_SIGNING_ENABLED=true` (and `NODE_ENV!=production`) may the server sign with
   the test `ISSUER_PRIVATE_KEY`. Production start-up hard-rejects the combination.
9. **Admin reindex: dev-guarded endpoint + worker CLI.** `POST /api/v1/admin/reindex`
   registered only when `NODE_ENV!=production` (or behind an admin token), plus a worker CLI
   command for ops resets. Disabled in production by default.
10. **Rate-limiting on mutations/prepares.** The global `ThrottlerModule` covers the base;
    prepare/auth endpoints get a tighter named throttle. Read endpoints keep the default.

## Module Map (what each owns)

- **ConfigModule** — extend `EnvSchema` with `CHAIN_ID`, RPC URL, `JWT_SECRET`,
  `DEMO_ISSUER_SIGNING_ENABLED`, indexer knobs (`CONFIRMATIONS`, `REWIND_WINDOW`,
  `POLL_INTERVAL_MS`). Fail-fast validation already in place.
- **ChainModule** — viem public client (+ optional wallet client for demo signer),
  contract clients bound via `@matura/chain/contracts`, deployment-manifest validation on
  boot (`getDeployment` throws on zero-seed).
- **IndexerModule** — poll loop, confirmation depth, cursor persistence, reorg rewind,
  idempotent upserts, backfill from `getDeploymentBlock`. Worker entrypoint.
- **IssuersModule** — issuer projection queries + attestation prepare/verify helpers.
- **ClaimsModule** — portfolio/claim reads + `claims/registration/prepare`.
- **QuotesModule** — vault quote collection (`quotes/preview`), reads `VaultRegistry`.
- **RoutingModule** — stub now; optimizer in Prompt 5.
- **ExecutionsModule** — execution prepare + receipt lookup by `executionId`.
- **SettlementsModule** — settlement projection + `settlements/:claimId/prepare` (issuer
  demo).
- **HealthModule** — liveness + DB/RPC/cursor-freshness readiness.

## Endpoint → Source Map

| Endpoint | Kind | Backed by |
|---|---|---|
| `GET /account/:wallet` | read | `ClaimProjection` by `[beneficiary,state]` |
| `GET /claims/:claimId` | read | `ClaimProjection` PK |
| `GET /vaults` | read | `VaultRegistry.getVaults()` live + short-TTL cache (no table) |
| `GET /executions/:executionId` | read | `RouteExecution` + legs |
| `GET /activity/:wallet` | read | merged projection stream, keyset by `(blockNumber, logIndex)` desc |
| `POST /issuer/attestations/prepare` | prepare | EIP-712 `ClaimAttestation` |
| `POST /claims/registration/prepare` | prepare | `ClaimRegistry.registerClaim` calldata |
| `POST /quotes/preview` | prepare-ish | vault quote math |
| `POST /settlements/:claimId/prepare` | prepare | settlement calldata (demo) |

## Resolved Decisions (was Open Questions)

Grounded in the code on 2026-09-26; see rationale inline.

1. **`@matura/chain` gets a tsup dual CJS/ESM+types build** — mirroring `@matura/shared`
   (which already does this so the CJS API can `require()` it). `@matura/chain` is currently
   `"type":"module"` with **no build** (exports point at raw `./src/*.ts`); today's consumers
   are bundler/loader runtimes (Next.js `apps/app`, `tsx`-run contracts scripts). `apps/api`
   is `nest build` → CommonJS + Jest and cannot transpile a dependency's raw ESM `.ts`. Both
   the API process (prepare endpoints need addresses/ABIs/EIP-712 domains) and the worker
   need `@matura/chain`, so a worker-only ESM path was rejected. Add tsup with conditional
   `import`/`require`/`types` per subpath, wire into the turbo build graph so ABI/manifest
   regen rebuilds it; `as const` ABI literal types survive in the `.d.ts` (viem inference
   preserved). Blast radius: Next.js app + contracts scripts resolve built output instead of
   raw src — acceptable, arguably better.
2. **`RouteExecution.targetAdvance` is populated by decoding the `route()` tx calldata.**
   `RouteExecuted(executionId, user, totalAdvance, totalFaceAssigned, totalCost)` omits
   `targetAdvance`, but it's a field of the signed `ExecutionRoute` struct (the user's
   requested minimum) recoverable from tx input. On `RouteExecuted`, the indexer fetches the
   tx and `decodeFunctionData`s the router `route()` input. **Zero schema churn** (Prisma
   model + shared `ExecutionRoute` DTO keep the field), fully chain-derived, idempotent on
   replay; one extra RPC per route (rare).
3. **`activity` feed = one merged, time-ordered stream** filtered to the wallet (claim
   registered / state-changed / slice reserved / route executed / settled), with **keyset
   pagination on `(blockNumber, logIndex)` descending** — columns already on every projection
   row; stable, no OFFSET drift.
4. **Vaults are read live with a short cache — no projection table.** The Prisma schema has
   **no `VaultProjection`** (it projects claims/routes/issuers/settlements only); vaults are
   discovered at runtime via `VaultRegistry.getVaults()`, there are two, and key fields
   (liquidity) are dynamic per block. `GET /vaults` and `quotes/preview` read live (viem
   multicall) behind a short TTL cache.
5. **SIWE session token travels as `Authorization: Bearer <jwt>`.** Stateless, no CSRF
   machinery, works with the existing CORS allowlist; simplest for API + SPA. (XSS token
   exposure is the accepted tradeoff vs. an httpOnly cookie.)
6. **Confirmation depths (env-configurable via `ConfigModule`):** BSC Testnet
   `CONFIRMATIONS=15`, `REWIND_WINDOW=30`, `POLL_INTERVAL_MS≈4000` (≈ block time); Local
   `CONFIRMATIONS=0`, `REWIND_WINDOW=0`, `POLL_INTERVAL_MS≈1000`.

## Acceptance Criteria (restated)

- Prisma migrations committed and reproducible (incl. new `AuthNonce`).
- OpenAPI accurately describes request/response DTOs (derived from `@matura/shared` Zod).
- Seeded local claims visible via `GET /account/:wallet` after indexing.
- Restarting the indexer does not duplicate data.
- API lint, typecheck and tests pass (unit: event mapping, serialization, config;
  integration: idempotent projection + cursor vs. Postgres; a simulated short reorg; API
  tests for invalid address / unsupported chain / unauthorized wallet / malformed amount).
