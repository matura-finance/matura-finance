# Matura — Live Demo Script (≤3 minutes)

A narrated, timed hackathon demo driven **LIVE** against
[`app.usematura.xyz`](https://app.usematura.xyz) → **BSC Testnet (chainId 97)**.

This script is the presenter's runbook: read it top to bottom, rehearse it once end
to end, and run it live. The local Hardhat stack is **rehearsal / reset only** — the
primary demo is the live testnet app.

> Brand terms are load-bearing — say them exactly: **Matura Account**, **Matura
> Claims**, **Matura Vaults**, **Matura Router**, **Matura Protocol**.

Cross-references (do not duplicate — read alongside):

- **`docs/demo-operator-checklist.md`** — the full pre-flight + abort conditions. This
  script's checklist below is the demo-day subset; that file is authoritative.
- **`packages/contracts/config/demo.ts`** — the locked scenario numbers (Request A / B).
- **`packages/contracts/config/vault-mandates.ts`** — the Stable / Flex vault mandates.

---

## Part 1 — Pre-demo checklist + fallback plan

Run this **before** the audience is watching. Do not start the timed script with any
item unresolved.

### 1.1 Readiness (must all be GREEN)

- [ ] **Smoke test green.** Run the readiness command and confirm it exits 0:

  ```bash
  export PATH="/opt/homebrew/opt/node@24/bin:$PATH"   # keg-only Node 24; verify: node -v → v24.x
  pnpm --filter @matura/contracts smoke:bsc-testnet
  ```

  It asserts the demo Claims are **eligible**, each route leg's **vault liquidity** is
  sufficient, and the **operator wallet holds tBNB**. If it is red, **do not demo live**
  — fall back to the recording (tier 2 below).

- [ ] **MetaMask connected, correct network.** Wallet unlocked, on **BSC Testnet
      (chainId 97)**, showing the demo wallet you seeded against.

- [ ] **Demo wallet PRE-FUNDED with tBNB.** The connected wallet signs `executeRoute`
      on chain 97 and needs gas. Fund it **during rehearsal** — never rely on a faucet at
      demo time (faucets rate-limit and stall). This is the single most common live-demo
      death; the smoke test checks it, but eyeball the balance anyway.

- [ ] **Baked frontend domains match API SIWE/CORS.** The hosted API must have
      `SIWE_DOMAIN=app.usematura.xyz` (bare host, **no scheme**) and
      `API_CORS_ORIGINS=https://app.usematura.xyz` (scheme, **no trailing slash**). A
      mismatch means **every SIWE login returns 401** and the demo dies at sign-in. See
      the operator checklist §1 for the exact values.

- [ ] **Portfolio shows the expected Claims.** Open `/account` and confirm the Matura
      Claims render (see the note under Beat 2 about the stream Claim on testnet).

- [ ] **One silent end-to-end rehearsal pass** already done today: optimize → review →
      sign → submit → the Activity feed indexes the tx. Sign **promptly** — a route intent
      lives ~120s (single-use TTL); dawdle and it expires and you must re-optimize.

### 1.2 Local rehearsal / reset (NOT the live demo)

Use the local stack only to rehearse choreography and to reset seeded state between
practice runs:

```bash
pnpm --filter @matura/contracts demo:reset:full   # wipe + redeploy + seed a fresh local chain
```

Local-only settlement (used for Beat 6 narration, since testnet has no time-travel):

```bash
pnpm --filter @matura/contracts demo:settle        # route → time-warp → obligor settle → PAID
```

### 1.3 Two-tier fallback plan

- **Tier 1 — live testnet (primary).** `app.usematura.xyz` → BSC Testnet. This is the
  demo.
- **Tier 2 — pre-recorded screen capture (fallback).** During rehearsal, record a clean
  full-run screen capture and keep it handy. If RPC, the faucet, or the indexer stalls
  mid-demo, **switch to the recording and narrate over it** — and say out loud, clearly,
  that it is a recording.

> **NEVER fake a live transaction.** Do not mock a tx hash, doctor an explorer page, or
> imply on-chain state that did not happen. If live fails, you narrate a labeled
> recording. Honesty is the whole point of the "best execution, verifiable on-chain"
> pitch — do not undercut it.

---

## Part 2 — The timed script (nine beats)

Each beat gives the **spoken line**, the **on-screen action**, and an **approximate
duration**. Optional beats are marked `(optional)` and are excluded from the ≤3:00 core
budget (see the timing table in Part 3).

The two live requests are the locked scenario numbers from
`packages/contracts/config/demo.ts`:

| Request | You type (Amount needed) | What the Router does                                 | Vaults          | Demonstrates                             |
| ------- | ------------------------ | ---------------------------------------------------- | --------------- | ---------------------------------------- |
| **A**   | `4800`                   | Slices a **partial** payroll payment, cheapest vault | Stable (50 bps) | Partial slicing + cheapest vault         |
| **B**   | `24000`                  | **Aggregates** payroll + freelance across two pools  | Stable + Flex   | Multi-claim aggregation + best execution |

---

### Beat 1 — Problem statement · ~30s

- **Say:** "Verified future payments — your payroll, a signed freelance invoice, a
  vesting stream — are real money you've earned, but they're **illiquid**. Today, to get
  cash early, you have to **sell the whole invoice** to a factor and eat a steep haircut.
  You shouldn't have to sell an entire future payment just to unlock **part** of its
  value. Matura fixes that."
- **On screen:** Landing page `usematura.xyz`, or the `/account` header. No wallet action
  yet.

### Beat 2 — Portfolio intro · ~20s

- **Say:** "This is a **Matura Account**. It holds three **Matura Claims** — a $20,000
  payroll payment due in 30 days, a $15,000 freelance escrow due in 45 days, and a
  vesting stream, about $10,000 vested so far. All verified, all on-chain, none of it
  liquid yet."
- **On screen:** `/account` — the three Matura Claims (payroll 20k / freelance 15k /
  stream ~10k).

> **Operator note (testnet stream Claim):** the seed **skips the stream Claim when
> `SEED_BENEFICIARY` overrides the beneficiary** (the stream is recipient-gated), so a
> connected demo wallet may show **only payroll + freelance**. If you need all three
> Claims visible, either (a) connect the **deployer** wallet with `SEED_BENEFICIARY`
> unset (fallback beneficiary gets all three), or (b) show the three-Claim portfolio
> from the **local** rehearsal stack and do the live requests on testnet. Decide which
> before you present, and word Beat 2 to match what's actually on screen — never
> describe a Claim the audience can't see.

### Beat 3 — Request A: partial slice, cheapest vault · ~30s

- **Say:** "I need **$4,800** today — not the whole payroll payment, just part of it. I
  ask Matura for $4,800." (type it) "The **Matura Router** compares every eligible Claim
  and every **Matura Vault**, and it slices off only a **partial** piece of the payroll
  Claim — and routes it to the **cheapest** vault, our Stable Vault at 50 basis points.
  Notice what I **keep**: the rest of the payroll payment stays mine. I sold a slice, not
  the invoice."
- **On screen:** `/request` → type `4800` → **Find my best route** → the review shows a
  single leg on **Stable Vault**, the rate, **You receive $4,800**, and the **You
  retain** balance (the un-sold remainder of the payroll face).

### Beat 4 — Request B: aggregation + best execution · ~35s

- **Say:** "Now I need **$24,000** — more than any single Claim can cover. Watch the
  Router aggregate. No one Claim is big enough, so it combines the **payroll** Claim and
  the **freelance** Claim, and here's the interesting part: it routes them to **two
  different vaults**. Payroll is cheapest on the **Stable Vault**. But the freelance
  escrow isn't eligible for Stable — its mandate excludes that Claim type — so it goes to
  the **Flex Vault** at 150 basis points. The Router found the **cheapest verifiable
  route across competing pools** — that's best execution, computed deterministically."
- **On screen:** `/request` → type `24000` → **Find my best route** → the review shows
  **two legs**: payroll → Stable, freelance → Flex. Point at the allocation bar, the two
  vault rows, and the **effective cost**.

> **Why two vaults (grounded in config):** Stable Vault's mandate is `PAYROLL | STREAM`
> only (`supportedTypesBitmap = 0b101`) at 50 bps; Flex Vault supports **all** types at
> 150 bps. The freelance Claim is `FREELANCE_ESCROW`, so Stable can't take it — Flex is
> its only home. The Router prices both and picks the cheapest legal assignment. (Source:
> `packages/contracts/config/vault-mandates.ts`.)

### Beat 5 — Wallet confirmation + on-chain proof · ~25s

- **Say:** "I confirm. My wallet asks me to **sign the route** — an EIP-712 typed
  message pinned to the Matura Router contract — and then submit `executeRoute` to **BSC
  Testnet**. And here it is on the block explorer: the exact route I just saw, settled
  on-chain. Verifiable, not a screenshot."
- **On screen:** Click **Confirm and receive liquidity** → MetaMask: sign the EIP-712
  `ExecutionRoute`, then confirm the `executeRoute` tx → open the tx on
  **testnet.bscscan.com**.

> **⚠️ Proof-tx reconciliation — READ BEFORE DEMO.** The committed proof tx in the
> gitignored runbook (`executeRoute 0xc753cf91e3d38b6b3ccaec68e5d914a228e6f72d663cd0da47320932d1911be6`)
> was executed against the **old** Request B, _before_ Request B was retargeted to
> payroll + freelance. So it will **not** match the route you narrate in Beat 4. Pick one:
>
> 1. **(Preferred)** During rehearsal, **re-execute the current Request B live** on
>    testnet and capture the **fresh tx hash**; use that link in Beat 5 so the explorer
>    route exactly matches what you narrated. Record the new hash in
>    `docs/deployment-runbook.md` (gitignored).
> 2. **(Fallback)** Use the committed `0xc753…` link but **caption it precisely** — e.g.
>    "a prior executeRoute proof; the two-vault route just shown produces an equivalent
>    on-chain tx." Do **not** claim the linked tx _is_ the route from Beat 4.
>    Whichever you choose, the link's on-chain reality must match your words.

### Beat 6 — Settlement waterfall + retained balance · ~20s · (optional)

- **Say:** "At maturity, the obligor pays the Claim in full. The vault is made whole
  first, and the remainder — the face I **retained** — flows back to me. Here's that
  waterfall from a local settlement run, since testnet can't fast-forward time."
- **On screen:** Terminal output of `pnpm --filter @matura/contracts demo:settle` (run
  locally in advance): route → time-warp → obligor `settle` → Claim `PAID`, user keeps
  the retained face.
- **Why optional:** BSC Testnet has **no time-travel**, so a true maturity settlement
  can't happen live inside the demo window. Narrate it from local output, or skip it to
  protect the ≤3:00 budget.

### Beat 7 — Delayed / ineligible-claim exception (LIVE) · ~20s

- **Say:** "One more thing that matters for trust: the Router is **honest about what it
  won't do**. Look at the _Also considered_ panel — here's a Claim it **excluded**,
  because it's not yet due / not eligible for these vaults. It doesn't quietly stuff an
  ineligible Claim into a route to hit your number. It shows you exactly what it skipped
  and why."
- **On screen:** In a route review (Request A is ideal — it only needs a partial payroll
  slice), point at the **"Also considered"** section, where the un-used / ineligible
  Claims appear with a **reason badge**. This is real optimizer output — nothing faked.
- **(optional)** Reference the local `demo:settle` waterfall for the **delayed-obligor**
  path (what happens when an obligor pays late).

> This exclusion is genuine `RouteBreakdown` behavior — the `rejected` / `filteredOut`
> legs render from the live optimize response
> (`apps/app/src/components/request/route-breakdown.tsx`). Never fabricate an exclusion;
> if the panel is empty for your chosen request, use Request A, whose surplus Claims are
> naturally set aside.

### Beat 8 / 9 — Closing differentiation · ~15s

- **Say:** "So, three things no invoice factor gives you: **aggregation** — combine many
  future payments into one request; **partial slicing** — unlock part of a Claim and keep
  the rest; and **best execution** — the cheapest verifiable route across competing pools,
  proven on-chain. That's the **Matura Protocol**."
- **On screen:** Back to the two-vault Request B review, or a summary slide with the three
  words: **aggregation · partial slicing · best execution**.

---

## Part 3 — Timing table (proves the core path ≤ 3:00)

The **core path** excludes the optional beats. Beat 6 is fully optional; Beat 7's core
(the live exclusion) is included, and only its `demo:settle` reference is optional.

| Beat                          | Content                                     |          Seconds | In core budget?         |
| ----------------------------- | ------------------------------------------- | ---------------: | ----------------------- |
| 1                             | Problem statement                           |               30 | ✅                      |
| 2                             | Portfolio intro (three Matura Claims)       |               20 | ✅                      |
| 3                             | Request A — partial slice, cheapest vault   |               30 | ✅                      |
| 4                             | Request B — aggregation across two vaults   |               35 | ✅                      |
| 5                             | Wallet sign + BSC Testnet explorer proof    |               25 | ✅                      |
| 6                             | Settlement waterfall (local narration)      |               20 | ⬜ optional             |
| 7                             | Delayed / ineligible-claim exclusion (LIVE) |               20 | ✅                      |
| 8/9                           | Closing differentiation                     |               15 | ✅                      |
| **Core total (excl. Beat 6)** |                                             | **175 s = 2:55** | **≤ 3:00 ✅**           |
| **Full total (incl. Beat 6)** |                                             | **195 s = 3:15** | over — trim if included |

**Budget guidance:** the core seven beats land at **2:55**, with ~5s of slack. If you
include Beat 6, you must trim ~15s elsewhere (tighten Beat 1 and Beat 4) to stay under
3:00. When live latency eats time (wallet popup, block confirmation, indexer catch-up),
**drop Beat 6 first, then compress Beat 1** — never rush the sign/proof in Beat 5, which
is the credibility moment.

---

## Quick-reference card (tape to the podium)

1. Smoke green · wallet on chain 97 · tBNB funded.
2. Beat 3: type **4800** → best route → one Stable leg → point at **You retain**.
3. Beat 4: type **24000** → best route → **two legs** (payroll→Stable, freelance→Flex).
4. Beat 5: **sign fast** (intent TTL ~120s) → submit → open the **matching** testnet.bscscan.com tx.
5. Beat 7: point at **Also considered** (real exclusion).
6. Close: **aggregation · partial slicing · best execution — the Matura Protocol.**
7. If anything stalls: switch to the labeled recording you prepared. Never fake a tx.
