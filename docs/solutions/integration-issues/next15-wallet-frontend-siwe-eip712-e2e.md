---
title: "Next 15 wallet frontend: consuming chain/API, SIWE session, EIP-712 signing, and e2e wallet injection"
category: integration-issues
tags:
  [
    apps-app,
    apps-landing,
    apps-e2e,
    next15,
    wagmi,
    viem,
    eip712,
    siwe,
    tanstack-query,
    react-hooks,
    csp,
    playwright,
    eip6963,
    bigint,
    ts-eslint,
    bundle-size,
  ]
module: "apps/app, apps/landing, apps/e2e, @matura/chain, @matura/ui"
symptom: "Building the wallet-connected product (apps/app) + marketing site (apps/landing) on the existing scaffolds: connecting the API/chain/wallet, SIWE auth, the best-execution sign→submit flow, and Playwright e2e — with a green build/lint/typecheck and no `any`."
root_cause: "The wagmi connectors barrel drags a broken transitive dep into the Next build; unstable custom-hook return values cause effect refetch loops; SIWE rehydrate races wallet reconnect; the EIP-712 money boundary is easy to double-scale; a mock wallet that always returns accounts makes wagmi auto-connect; zod 4 + turbo env + verbatimModuleSyntax have sharp edges."
date: 2026-09-27
related:
  - docs/solutions/build-errors/apps-api-cjs-chain-prisma-viem-toolchain.md
  - docs/solutions/integration-issues/best-execution-router-mirror-intent-optimizer.md
  - docs/routing.md
  - docs/plans/2026-09-26-feat-matura-frontends-landing-and-product-plan.md
---

# Next 15 wallet frontend — chain/API consumption, SIWE, EIP-712, e2e

Reusable gotchas from building `apps/app` (product) + `apps/landing` (marketing) + `apps/e2e`
(Playwright) on top of `@matura/{chain,shared,ui}` and the NestJS API. Each entry is a
symptom → root cause → fix that recurs across frontend iterations.

## 1. `wagmi/connectors` barrel breaks the Next production build

**Symptom:** `import { mock } from "wagmi/connectors"` (added for e2e signing) → `next build`
fails with `Module not found: Can't resolve '@x402/evm'`.

**Root cause:** the `wagmi/connectors` barrel re-exports the Coinbase Base-account connector,
whose transitive chain `@base-org/account → @coinbase/cdp-sdk → @x402/evm` has a missing/optional
module. Importing anything from the barrel pulls that in. It also bloats the bundle with every
connector.

**Original fix (EIP-6963-only era):** do **not** ship a wagmi `mock` connector inside the app.
Keep the app connector list empty and rely on wagmi's default EIP-6963 discovery. For e2e, inject
a mock EIP-1193 provider at the **Playwright layer** (see §7).

**Update (2026-10-06 — WalletConnect added via Reown AppKit):** the product now ships Reown
AppKit (`@reown/appkit` + `@reown/appkit-adapter-wagmi`) so mobile wallets can connect over
WalletConnect, reversing the earlier "EIP-6963 only / no WalletConnect" decision. AppKit does **not**
let you avoid the barrel — its wagmi adapter (`@reown/appkit-adapter-wagmi/.../helpers.js`) imports
the full `@wagmi/connectors` barrel, so the same `baseAccount → @base-org/account → @coinbase/cdp-sdk
→ @x402/*` chain re-appears and `next dev`/`build` 500 on `Can't resolve '@x402/evm/upto/client'`.
Mitigation lives in `apps/app/next.config.ts`: a `webpack.IgnorePlugin` drops the whole `@x402`
namespace (the only importer, Coinbase's `signX402Payment`, is unreachable — we never instantiate the
baseAccount connector) plus the two benign optional deps the WC/MetaMask web stack `require()`s in
other runtimes (`@react-native-async-storage/async-storage`, `pino-pretty`). This also required
widening the CSP `connect-src`/`img-src`/`frame-src` to WalletConnect/Reown hosts (see §6) and a
public `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. Config lives in `apps/app/src/lib/appkit-config.ts`;
`createAppKit` runs once at module scope in `providers.tsx`; the header button calls
`useAppKit().open()`. The Playwright EIP-6963 injection in §7 still works unchanged (AppKit surfaces
injected providers via EIP-6963).

## 2. Post-execution refetch loop from unstable hook return values

**Symptom:** after a route executes (`status: EXECUTED`), the app hammers `GET /account/:wallet`
and `/activity` continuously on the success screen.

**Root cause:** a `useEffect` depended on `tx` (a fresh object literal returned by a custom hook
every render) and on `invalidate` (a **bare arrow** returned unmemoized from a custom hook). The
effect re-ran every commit; the cached `EXECUTED` status kept the guard true; each run called
`invalidate` → refetch → re-render → invalidate → … a self-sustaining loop.

**Fix:** memoize hook return callbacks with `useCallback`, and depend on **stable primitives +
memoized callbacks** (`tx.state.status`, `tx.markIndexed`), never the whole object literal.

```ts
// custom hook: return a stable callback
export function useInvalidateOnSettled() {
  const qc = useQueryClient();
  return useCallback(
    (wallet: string) => {
      /* invalidate portfolio + activity */
    },
    [qc],
  );
}
// consumer: depend on stable refs, not the object
const { markIndexed } = tx;
useEffect(() => {
  if (poll.data?.status === "EXECUTED") {
    markIndexed();
    invalidate(addr);
  }
}, [poll.data?.status, markIndexed, invalidate, addr]);
```

Rule: a custom hook returning `{ a, b, c }` produces a **new object identity every render** — the
individual `useCallback`/`useState` members are stable, the wrapper is not. Destructure and depend
on members.

## 3. SIWE session dropped on every reload (rehydrate races wallet reconnect)

**Symptom:** a signed-in user must re-sign SIWE on every page reload; `sessionStorage` persistence
appears broken.

**Root cause:** on mount, wagmi's `useAccount()` returns `address === undefined` while it
reconnects asynchronously. A rehydrate effect compared `stored.subject !== lowerAddress`
(`"0x…" !== undefined` → true) and dropped the session before the wallet resolved.

**Fix:** in the rehydrate effect, `if (lowerAddress === undefined) return;` — wait for reconnect
before judging the stored session. (Disconnect is handled separately via `useAccountEffect`.)

Session model that worked: header-bearer JWT held in memory + mirrored to `sessionStorage`
(not `localStorage`), subject bound to the active address, invalidate on
disconnect/account/chain-switch, re-SIWE on expiry, and **clear on any 401** (dead/rotated token)
via a mutation `onError` rather than retrying.

## 4. EIP-712 money boundary: `BigInt(str)`, not `toBaseUnits`

**Symptom / risk:** double-scaled amounts or `RangeError` when coercing the server's typed-data
message for signing.

**Root cause:** API money is **already** base-unit integer strings. Running it through
`toBaseUnits` (human ×10^6) multiplies again; and a wire schema that accepts `z.number()` lets a
value > 2^53 get precision-truncated by `JSON.parse` before `BigInt` sees it.

**Fix:**

- Signing-boundary coercion is `BigInt(str)`. `toBaseUnits` is for the **input box only**;
  `fromBaseUnits` for **display only**. Keep them out of the signing path.
- Money wire schemas are `z.string().regex(/^\d+$/)` — never `z.number()`.
- Build the typed-data message **once** and feed the same object to `signTypedData`,
  `hashTypedData` (for the `executionId` to poll), and `writeContract` args — so signature,
  polled id, and submitted struct can't drift.
- `hashTypedData` must include the **router domain** (`routerDomain(chainId, verifyingContract)`),
  or the client id won't match the on-chain `_hashTypedDataV4` digest.
- Keep one `bridge.ts` for brand→viem strips: `getAddress` (string→`Address`, no cast),
  `toBigInt`, a `toHex32` that **validates 32 bytes**, and a separate `toHexData` for
  arbitrary-length calldata (don't reuse the bytes32 helper on calldata).
- Defense-in-depth: pin the signed/submitted `to`/`verifyingContract` to the on-chain manifest
  address (`getDeployment(chainId).router`) and refuse on mismatch — never trust the API response
  blindly.

## 5. Consuming `@matura/chain` / `@matura/shared` in a Next 15 app

- Subpath imports (`@matura/chain/chains`, `/units`, `/deployments`, `/abis`, `/eip712`) **work**
  under Next's `moduleResolution: "Bundler"` — the "barrel-only" rule from the CJS `apps/api` does
  not apply here.
- Add every workspace package the app consumes to `transpilePackages` in `next.config.ts`.
- `zod` must be a **direct dependency** of the app (pnpm strict) even though it's transitive via
  `@matura/shared`, or `tsc` collapses shared types to `unknown`.
- **ABI bundle cost:** `@matura/chain/abis` is a barrel of all 8 ABIs (~95 KB source in one chunk).
  Add `"sideEffects": false` to `packages/chain/package.json` so the bundler can tree-shake the
  unused ones; per-ABI subpath exports would be even better.
- `verbatimModuleSyntax: true` → type-only imports must use `import type`.
- `noUncheckedIndexedAccess: true` → indexed lookups are `| undefined`; handle it.

## 6. Toolchain edges (lint/build) that cost time

- **`turbo/no-undeclared-env-vars`**: every `process.env.NEXT_PUBLIC_*` read must be listed in
  `turbo.json` `build.env`, or lint fails. Validate public env once in a typed zod module.
- **zod 4**: `z.string().url()` is deprecated → use `z.url()`.
- **strict ESLint**: `no-confusing-void-expression` bans `onClick={() => foo()}` when `foo()`
  returns void — wrap in braces `onClick={() => { foo(); }}`. `restrict-template-expressions` bans
  `number` in template literals — `String(n)`. `no-unnecessary-type-assertion` flags casts the
  receiver already accepts.
- Wallet-free landing: enforce the ban **in `packages/ui`'s own eslint config too**, not just in
  landing — a wallet import leaking into a shared primitive is otherwise invisible until the
  bundle-leak grep. Add a CI grep over the **built** landing output for `wagmi|viem|@matura/chain`
  - secret substrings.
- CSP for a Next wallet app: a fully strict nonce-based `script-src` is breakage-prone; the
  effective, low-risk control is a **restrictive `connect-src`** (self + API + RPC origins) that
  blocks token exfiltration even with `'unsafe-inline'` scripts, plus `frame-ancestors 'none'`,
  `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy` via `next.config` `headers()`.

## 7. Playwright e2e for a wallet dApp — mock EIP-1193 at the test layer

**Approach that worked (no wallet code in the app):** a Playwright fixture runs a **viem signer in
Node** (`privateKeyToAccount` + wallet/public clients), exposes it to the page via
`page.exposeFunction`, and `page.addInitScript` injects a thin EIP-1193 provider that delegates
every `request` to it and **announces itself over EIP-6963**. wagmi's default discovery then lists
it as a connector.

**Critical gotcha:** the mock must return `[]` for `eth_accounts` until an explicit
`eth_requestAccounts` (which flips an `authorized` flag). If it always returns the account, wagmi's
`reconnectOnMount` sees it as pre-authorized and **auto-connects**, making the connect flow
non-deterministic (sometimes already connected, sometimes not).

Other notes: `eth_signTypedData_v4` params arrive as a JSON string with numeric fields as
strings — coerce `uint*` fields to `bigint` (walk the `types`) before `account.signTypedData`.
`personal_sign` params are `[message, address]` (pick the non-address arg). Gate the product e2e
project behind an env flag (`E2E_STACK=1`) since it needs a seeded local chain + API + indexer
worker; keep the landing suite always-on (static, no chain). The signer address **must be the
seeded claim beneficiary** or optimize returns `NOT_OWNED_BY_WALLET`.

## Prevention checklist

- [ ] Custom hooks return `useCallback`-stable members; effects depend on members, not the object.
- [ ] No `wagmi/connectors` import in app code; mock wallet lives in the Playwright fixture.
- [ ] Money: `BigInt(str)` at the signing boundary; `z.string()` wire schemas; one coerced message for sign+hash+write.
- [ ] SIWE rehydrate waits for `address`; session cleared on 401 + account/chain switch.
- [ ] New `NEXT_PUBLIC_*` added to `turbo.json` `build.env`; `zod` is a direct app dep.
- [ ] `packages/ui` lint bans wallet imports; CI greps the built landing bundle.
- [ ] `@matura/chain` is `sideEffects:false`; app `transpilePackages` lists consumed workspace packages.
