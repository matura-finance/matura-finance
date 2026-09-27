# Threat Model — Matura P0

Scope: the seven P0 contracts (`MockUSDT`, `IssuerRegistry`, `ClaimRegistry`,
`LiquidityVault`, `VaultRegistry`, `MaturaRouter`, `SettlementManager`) on BSC
Testnet, **plus the off-chain surface** that fronts them — the `apps/api`
orchestration/read-model service and its indexer worker, and the `apps/app` /
`apps/landing` frontends. This is a demo/hackathon MVP — no real funds, no
mainnet. See `SECURITY.md` for disclosure + the testnet-only warning.

The contract sections come first (`## Assets` … `## Out of scope for P0`),
followed by the off-chain surface (`## API & auth surface`,
`## Indexer / read-model surface`, `## Frontend surface`) and a consolidated
`## Accepted risks` list.

## Assets

- **Vault capital** — admin-seeded MockUSDT held by each `LiquidityVault`.
- **User advances** — funds moved to the user on `executeRoute`.
- **Issuer attestation key** — the off-chain signer whose EIP-712 signature mints
  claims (`ISSUER_PRIVATE_KEY`; the most sensitive key).
- **Role/admin keys** — `DEFAULT_ADMIN_ROLE` and the ops roles.
- **Claim integrity** — the binding between an on-chain claim and the real invoice
  (`externalIdHash`, `evidenceHash`) and the financed-face accounting.

## Trust assumptions

- The admin (`DEFAULT_ADMIN_ROLE`) is honest. On testnet it is a single deployer
  key (accepted demo risk); production should use a multisig + timelock and OZ
  `AccessControlDefaultAdminRules`.
- Issuer signer keys are custodied off-chain by the registered issuer.
- **MockUSDT is a standard, non-rebasing, non-fee-on-transfer 6-decimal ERC-20**,
  and is the single settlement token for every claim and vault. Exact-pull
  settlement and `financedFaceValue` accounting depend on this.
- The chain supports EIP-1153 transient storage (BSC does) — required by
  `ReentrancyGuardTransient`. A non-1153 redeploy must switch to classic
  `ReentrancyGuard`.

Off-chain trust assumptions (see the surface sections below):

- The API **never holds a user key**. It serves read projections + chain
  read-through and prepares **unsigned** calldata / EIP-712 typed data; the user
  wallet signs. The on-chain nonce + deadline + domain are the real replay guard —
  the off-chain `RouteIntent` is a UX/idempotency layer, not a security boundary.
- `ISSUER_PRIVATE_KEY`, `DEPLOYER_PRIVATE_KEY`, `JWT_SECRET`, the RPC URL, and
  `DATABASE_URL` are supplied via environment/keystore, never committed. When
  `ISSUER_PRIVATE_KEY` is present the service **must not** boot with
  `NODE_ENV=production` (env validation fails closed — the demo signer is a
  testnet convenience, not a production custody model).
- A **single** Postgres instance backs the read-model; rate limiting is
  in-memory and per-wallet (accepted single-instance risk — see
  `## Accepted risks`).
- The frontend trusts the **on-chain manifest**, not the API response, for
  contract targets: prepared typed data is pinned to `@matura/chain` manifest
  addresses before signing. `apps/landing` is wallet-free by construction.

## Threats and mitigations

| Threat                                                      | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Signature replay (same/other chain or contract)             | Distinct EIP-712 domains per verifier (`MaturaClaimRegistry` / `MaturaRouter`), each folding in `chainId` + `verifyingContract`; OZ `_hashTypedDataV4` (never a frozen separator).                                                                                                                                                                                                                                                                                             |
| Attestation / route replay                                  | OZ `Nonces._useCheckedNonce` — per-signer for attestations, per-user for routes; consumed as an effect before interactions, so a reverted tx never burns a nonce.                                                                                                                                                                                                                                                                                                              |
| Signature malleability                                      | OZ `ECDSA.recover` (low-`s`, `v∈{27,28}`, EIP-2098 rejected); identity is the recovered address, never the signature bytes.                                                                                                                                                                                                                                                                                                                                                    |
| Compromised/rotated issuer signer still mints               | `signerEpoch` bound in the attestation; `rotateSigner` bumps the epoch; `isAuthorizedSigner` accepts only the current signer at the current epoch.                                                                                                                                                                                                                                                                                                                             |
| Shared-signer nonce collision                               | A signer may back only one issuer (`SignerAlreadyBound`), so signer-keyed nonces cannot collide across issuers.                                                                                                                                                                                                                                                                                                                                                                |
| Source adapter spoofs another issuer's provenance           | `registerFromSource` (a second registry writer, `SOURCE_REGISTRAR_ROLE`, distinct from the `ROUTER_ROLE` single-writer boundary) fixes the claim `issuer` to `msg.sender` — an adapter can mint ONLY as itself. It re-runs every `registerClaim` invariant except the EIP-712 signature; the caller's role + on-chain state is the authority. `_writeClaim` is the single shared effect+event site, so a source claim is byte-identical to a signed one except its provenance. |
| Source-claim provenance confusion (no signature)            | Source claims carry `issuer == the adapter` and NO issuer signature; signed claims carry a real issuer + ECDSA signature. The read-model distinguishes the two by `claimType`/issuer, never by signature presence. A contract address can never be an ECDSA `recover` output, so the signed path is unusable by an adapter.                                                                                                                                                    |
| Double-financing one invoice                                | Unique `claimId` and unique `externalIdHash` enforced at registration; `financedFaceValue + requested ≤ faceValue` enforced atomically in `reserveSlice`.                                                                                                                                                                                                                                                                                                                      |
| Fund-holding adapter drained across payouts                 | `MockFreelanceEscrow`/`MockStream` are their own bound obligors: `settle(claimId)` resolves the engagement/stream bound to that claim and pays only its own funds (never a pooled balance, unlike `SourceObligor`), marks the source Settled before the external call (CEI), and fails closed unless `settlementManager.feeBps() == 0`.                                                                                                                                        |
| Over-assignment across routes                               | `reserveSlice` checks-then-effects the cap in one call; `MAX_SLICES_PER_CLAIM` bounds fan-out. Property-tested.                                                                                                                                                                                                                                                                                                                                                                |
| Revocation of a funded claim                                | `revoke` requires `financedFaceValue == 0` (`ClaimAlreadyFunded`); funding state is monotonic.                                                                                                                                                                                                                                                                                                                                                                                 |
| Reentrancy on value paths                                   | `ReentrancyGuardTransient` on `executeRoute` / `settleClaim`; strict CEI; `SafeERC20`.                                                                                                                                                                                                                                                                                                                                                                                         |
| Trusting backend amounts                                    | Router recomputes every vault quote on-chain (`quoteAndCheck`) and re-checks all totals; never accepts a caller-supplied advance.                                                                                                                                                                                                                                                                                                                                              |
| Value leakage via rounding                                  | `Math.mulDiv` with `Ceil` on discount/fee (protocol/vault never undercharges); residual is the exact remainder. Boundary-tested.                                                                                                                                                                                                                                                                                                                                               |
| Settlement lockup (same vault, same claim, multiple routes) | `registerAllocation` aggregates per `(claimId, vault)`; settlement does one transfer + one `onSettlementReturn` per vault.                                                                                                                                                                                                                                                                                                                                                     |
| Silent allocation drift                                     | `settleClaim` asserts `Σ allocation.faceAmount == financedFaceValue` (`ConservationViolation`) from the actual amounts moved.                                                                                                                                                                                                                                                                                                                                                  |
| Residual miscompute                                         | `settleClaim` snapshots `faceValue`/`financedFaceValue` before any mutation; `releaseSlice` preserves `financedFaceValue`.                                                                                                                                                                                                                                                                                                                                                     |
| Double settlement                                           | `_settled` guard checked first (`AlreadySettled`).                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Gas griefing / unbounded loops                              | `MAX_SLICES_PER_CLAIM` and `MAX_LEGS` bound every loop; router duplicate-claim check is a bounded O(n²) memory scan.                                                                                                                                                                                                                                                                                                                                                           |
| Privilege confusion                                         | Role separation — reserve (`ROUTER_ROLE`) vs release (`SETTLEMENT_ROLE`); no address holds both; per-function `onlyRole`.                                                                                                                                                                                                                                                                                                                                                      |
| Paused settlement traps funds                               | `SettlementManager` is not pausable; only `MaturaRouter` and `LiquidityVault` funding are.                                                                                                                                                                                                                                                                                                                                                                                     |
| Post-deploy vault creates unsettleable claims               | New vaults must be wired atomically: grant `ROUTER_ROLE`+`SETTLEMENT_ROLE` then `registerVault` (the Ignition module and the `wireVault` flow do this in order).                                                                                                                                                                                                                                                                                                               |
| Removing a vault strands settlements                        | Vaults are never deleted; `active=false` only blocks new routing. Settlement pays the stored allocation vault regardless of registry status.                                                                                                                                                                                                                                                                                                                                   |
| Locked vault capital                                        | Admin `withdraw` bounded by `availableLiquidity`.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Non-settlement token slips in                               | `registerClaim` requires `att.token == settlementToken`.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Front-running the route submission                          | Payout recipient is `route.user` bound in the signed struct, never `msg.sender`; a relayer can submit but cannot redirect funds.                                                                                                                                                                                                                                                                                                                                               |
| Admin key compromise                                        | Role separation limits blast radius; production: multisig + timelock + DefaultAdminRules (future work).                                                                                                                                                                                                                                                                                                                                                                        |

## Out of scope for P0

Non-payment / default loss socialization; on-chain producers for `DISPUTED` /
`DEFAULTED` (reserved ordinals); public LP deposits; fee-from-spread economics
(P0 uses an issuer fee surcharge); upgradeable proxies; price oracles (pricing is
deterministic integer bps — no oracle attack surface); multi-token settlement.

## API & auth surface

Scope: `apps/api` — the HTTP orchestration + read-model service. It holds **no
user key**: read endpoints serve the projection + a chain read-through; write
endpoints return **unsigned calldata / EIP-712 typed data** for the wallet to
sign. Money crosses the JSON boundary as base-unit **strings**; addresses are
lowercase; `BigInt` never leaks.

| Threat                                                   | Mitigation                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SIWE login replay / cross-chain SIWE                     | Single-use SIWE nonce (issued + consumed server-side) with a `chainId` assertion; a nonce is spent once and a message minted for chain A is rejected on chain B.                                                                                                                                                                   |
| Forged / tampered session token                          | JWT is **algorithm-pinned** (no `alg=none`/alg-confusion) and **subject-bound** to the recovered wallet; the global guard is **fail-closed** (every route authed unless `@Public()`).                                                                                                                                              |
| Cross-wallet data access                                 | The recovered subject is bound to the request; wallet X cannot read wallet Y's `/account` — authorization is by the JWT subject, not a caller-supplied address.                                                                                                                                                                    |
| Stale-chain JWT reuse                                    | JWT carries the chainId it was minted for; a token for chain A is rejected against chain B (`wallet-auth.guard.ts`).                                                                                                                                                                                                               |
| Per-principal rate-limit evasion (IP rotation / NAT)     | Authenticated routes are throttled **per wallet**, not per IP (`WalletThrottlerGuard`, resolved after the auth guard); public routes fall back to IP. NAT'd wallets correctly share one budget. (In-memory / single-instance — see accepted risks.)                                                                                |
| Route replay after UI confirm / expiry                   | Signed `ExecutionRoute` carries a per-user on-chain nonce + deadline (the authoritative guard); a **single-use** `RouteIntent` row (create-or-ignore, consumed by an atomic `updateMany` guard, pruned expired-only) blocks off-chain double-submit. The intent is UX/idempotency, **not** the security boundary.                  |
| Prepared route that reverts on-chain (bad UX / griefing) | Exactly one off-chain `_validateLegs` mirror (`common/leg-mirror.ts`), pinned to a single finalized block via a `PinnedReads` facade, re-validates every leg (incl. effects-phase remaining-face / slice-count) before emitting signable data. It is the single source; forking it is the documented drift trap.                   |
| Trusting backend-computed advances                       | The router recomputes every quote on-chain; the API mirror is advisory (rejection-reason granularity), never authoritative. Off-chain-only caps (`maxTotalCost`, no on-chain field) are enforced at **prepare**.                                                                                                                   |
| Malformed / hostile input (money, legs, paging)          | Zod at the boundary: base-unit money is `^\d+$` (no floats / `1e9` / empty / negative), zero-leg routes → `EMPTY_ROUTE`, activity `limit` bounded, `Json` re-parsed through Zod on read-back (never a blind brand cast).                                                                                                           |
| Auth'd combinatorial DoS on the optimizer                | Bounded exact search with a hard `SEARCH_LEAF_BUDGET`; on overrun it falls back to a deterministic greedy result rather than blocking the event loop.                                                                                                                                                                              |
| Secret / internals leak via error or log                 | The global exception filter returns generic coded errors; raw `PrismaClientKnownRequestError` (meta/SQL), stack traces, and `Error` messages are not reflected to the client body. Verified by regression test; a related fix now maps body-parser 413/400 to their real 4xx status (not a masked 500) while preserving redaction. |
| Read-through masks a transport fault as "not found"      | An RPC read that _throws_ surfaces as 5xx, not a 404 `CLAIM_NOT_FOUND`; the catch narrows on `BaseError.walk` (contract revert) rather than swallowing all errors. Confirmed correct (proof-of-control); locked in by regression test.                                                                                             |
| Mirror accepts an inactive issuer / vault                | The mirror rejects an inactive issuer (`ISSUER_INACTIVE`) and inactive vault (`VAULT_INACTIVE`) — `getVaults()` returns all vaults, so active-state is checked per vault. Confirmed correct (proof-of-control); locked in by regression test.                                                                                      |
| Demo issuer signer misuse                                | Server-side signing is gated by `DEMO_ISSUER_SIGNING_ENABLED` parsed via `z.stringbool` (fail-**closed**, not `z.coerce.boolean`); `ISSUER_PRIVATE_KEY` + `NODE_ENV=production` refuses to boot.                                                                                                                                   |

## Indexer / read-model surface

Scope: the separate-process indexer worker (`worker.ts`) that projects on-chain
events into Postgres/Prisma and the read endpoints that serve those projections.
The chain is the source of truth; the projection is a rebuildable cache.

| Threat                                                        | Mitigation                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projecting an unconfirmed / reorged block                     | Polls the `finalized` tag (configurable confirmations); a **block-hash mismatch** at the cursor triggers a full wipe + reindex from `deploymentBlock`, yielding canonical state.                                                                                                                |
| Half-applied batch / cursor drift                             | Projections **and** the cursor advance in **one advisory-locked transaction**; a crash mid-batch rolls back so the cursor never runs ahead of applied rows.                                                                                                                                     |
| Duplicate rows on replay                                      | Idempotent upserts keyed by event identity; replaying an already-projected range is a no-op (no dup rows, unchanged projection).                                                                                                                                                                |
| API/DB unavailable while chain advances                       | The cursor is durable and only moves on committed projection; once the DB is restored the worker catches up so projection == on-chain with no lost/duplicated rows. Verified by integration test (DB-down then restored → projection == on-chain, cursor past the tx block, replay idempotent). |
| Child event with an unknown parent ordinal wedges the indexer | An event whose parent claim was skipped (unknown enum ordinal) is **skipped, not FK-aborted**, so one unexpected event cannot wedge the whole worker.                                                                                                                                           |
| Enum-ordinal drift (Solidity ↔ shared)                        | `ClaimTypes`/`ClaimStates` ordinals are law; parity tests (`EnumParity.test.ts`, `enum-parity.spec.ts`) guard drift so the indexer never mis-maps a state.                                                                                                                                      |

## Frontend surface

Scope: `apps/app` (wallet-connected product, `app.matura.xyz`) and `apps/landing`
(static, wallet-free marketing, `matura.xyz`).

| Threat                                             | Mitigation                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Secret shipped in a client bundle                  | `apps/landing` is wallet/chain/secret-free (a CI grep gate over the built bundle, incl. subpath imports); a new guard (`check-app-secrets.mjs`, wired into `check:bundle`) fails the build if the product-app bundle contains `ISSUER_PRIVATE_KEY` / `JWT_SECRET` / `DEPLOYER_PRIVATE_KEY` / `DATABASE_URL` (wallet/chain code IS expected there, unlike landing). |
| Malicious API response redirects funds / signature | Prepared typed data is **pinned to the on-chain manifest** before signing — refusal now lives in the pure `prepareRoute` boundary (any leg whose `to`/`verifyingContract` != the manifest router is rejected, and the EIP-712 domain is pinned to the manifest router, never the API-claimed value). Hardened this pass (P1 defense-in-depth) + regression-tested. |
| Money-precision corruption at the signing boundary | The signing money boundary is `BigInt(str)` on the already-validated base-unit string (never `toBaseUnits`); one coerced message feeds sign + hash + `executeRoute`.                                                                                                                                                                                               |
| SIWE session leakage / stale session after switch  | Header-bearer JWT held in-memory + `sessionStorage`, subject-bound, cleared on 401 or account/chain switch; no long-lived cookie.                                                                                                                                                                                                                                  |
| Wrong-network / arbitrary-RPC interaction          | wagmi + viem are pinned to BSC Testnet only (EIP-6963 discovery); CSP `connect-src` constrains outbound origins.                                                                                                                                                                                                                                                   |

## Accepted risks

Documented, **not** treated as defects in this hardening pass (out-of-scope by
design or a P2 not worth a fix under the testnet-hardened bar). Never silently
dropped.

- **Admin honesty / single deployer key.** `DEFAULT_ADMIN_ROLE` is a single
  testnet deployer key; the pass tests only role-separation blast radius (no
  address holds both `ROUTER_ROLE` and `SETTLEMENT_ROLE`), not admin malice.
  Production wants multisig + timelock + `AccessControlDefaultAdminRules`.
- **Fee-on-transfer / rebasing / non-standard token.** The asset is the
  `immutable`, standard 6-dp `MockUSDT`; every registration path rejects a
  non-settlement token, so a malicious-token deploy-and-drain is unreachable. At
  most one defensive `SafeERC20` unit test — not a supported configuration.
- **`SourceObligor` pooled cross-claim accounting.** `SourceObligor` holds a
  single undifferentiated pool with no per-claim binding, so settling one claim
  can draw funds "owed" to another (`SourceObligor.sol:26-31`). This is **not
  theft** (no attacker can name a beneficiary without an issuer key) and is
  accepted demo-only behavior; the per-claim-bound `MockFreelanceEscrow` /
  `MockStream` are the safe variants (their per-claim isolation is covered by
  the `MockFreelanceEscrow` test). Accepted as-is: no dedicated new
  characterization test was added and no contract change was made.
- **`SettlementReturnFailed` reconciliation surface.** If a vault return callback
  reverts, `SettlementManager` swallows it into a `SettlementReturnFailed` event
  (the claim still reaches `PAID`; funds are not stranded), leaving stale
  `principalByClaim` for an operator to reconcile. This is an intentional
  tradeoff — settlement must never brick — surfaced as an operator-visible
  reconciliation event, not an on-chain auto-repair. Verified by test: a reverting
  vault callback (revoked `SETTLEMENT_ROLE`) still marks the claim `PAID` with no
  `ConservationViolation`.
- **Non-pausable settlement & permissionless payer.** `SettlementManager` is
  deliberately non-pausable and its payer is permissionless: pause must never be
  able to strand a matured claim's settlement, and anyone may _pay_ a claim
  without being able to _redirect_ it (recipient is the signed allocation vault /
  bound beneficiary). Verified it cannot corrupt accounting; not redesigned.
- **Redis-less rate limiting across instances.** Per-wallet throttling is
  in-memory; a horizontally-scaled deployment would need a shared store. Accepted
  for the single-instance demo.
- **Out-of-scope by design** (see `## Out of scope for P0`): external audit,
  formal verification, mainnet operational security, multi-token settlement,
  price oracles, upgradeable proxies, public LP deposits, loss socialization.
