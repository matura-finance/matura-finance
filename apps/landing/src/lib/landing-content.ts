/**
 * Static content for the landing one-pager — section copy and data tables.
 * Framework-free; imported by `app/page.tsx` and the section helpers.
 */

export const PROBLEM_FLAWS = [
  {
    tag: "01 / siloed",
    title: "Financed in isolation",
    body: "Every payment is financed on its own — no single view of everything you're owed.",
    who: "Anyone juggling more than one income source",
  },
  {
    tag: "02 / single-provider",
    title: "One-provider pricing",
    body: "One quote, zero competition. You overpay, every single time.",
    who: "Everyone",
  },
  {
    tag: "03 / all-or-nothing",
    title: "All-or-nothing",
    body: "Forced to finance the whole invoice when you only need a slice.",
    who: "Anyone who needs $200, not $2,000",
  },
] as const;

// Router section accordion — the lead item is open by default; the rest expand.
export const ROUTER_ACCORDION = [
  {
    title: "One request, competing vaults",
    body: "You're never stuck with one lender or forced to finance a whole invoice. Matura shops your request across vaults — even splitting a claim when that's cheaper — to reach your exact amount at the best price.",
  },
  {
    title: "Precise, no-rounding pricing",
    body: "Costs are worked out with exact math, so there's no rounding drift — it weighs the real options to find the best combination.",
  },
  {
    title: "Same request, same result",
    body: "The same request at the same moment always gives the same route — picked by lowest cost first, then the fewest steps.",
  },
  {
    title: "The quote is what you get",
    body: "The price you're quoted is exactly what gets funded — no gap between the quote and the transaction.",
  },
  {
    title: "Fresh, one-time routes",
    body: "Each route is prepared fresh, re-checked right before you sign, and can only be used once.",
  },
] as const;

export const ONCHAIN_LAYERS = [
  {
    key: "claim",
    icon: "doc",
    span: "lg:col-span-2",
    title: "Claim state",
    body: "Issuer-authorized, revocable, and traceable — on a ledger anyone can check.",
  },
  {
    key: "vault",
    icon: "shield",
    span: "lg:col-span-1",
    title: "Vault accounting",
    body: "Liquidity and reservations, auditable by anyone.",
  },
  {
    key: "route",
    icon: "key",
    span: "lg:col-span-1",
    title: "Route authorization",
    body: "Your signature binds exactly what will execute.",
  },
  {
    key: "settle",
    icon: "swap",
    span: "lg:col-span-2",
    title: "Settlement",
    body: "Atomic funding, with every balance conservation-checked at settlement.",
  },
] as const;

export const LAYER_ICON_PATHS = {
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 15l2 2 4-4",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4",
  key: "M15.5 7.5a4 4 0 1 0-4.9 3.9L3 19v2h2l1-1h2v-2h2l1.6-1.6a4 4 0 0 0 3.9-4.9z M18 7h.01",
  swap: "M8 3 4 7l4 4 M4 7h16 M16 21l4-4-4-4 M20 17H4",
} satisfies Record<(typeof ONCHAIN_LAYERS)[number]["icon"], string>;

export const ISSUER_FEATURES = [
  {
    kind: "sign",
    title: "One-signature issuance",
    body: "Attest a payout once — amount, payee, due date — and it's a routable claim.",
  },
  {
    kind: "rules",
    title: "Your rules, enforced",
    body: "Set eligibility and limits; the protocol enforces them on every claim.",
  },
  {
    kind: "report",
    title: "Settled and reported",
    body: "Automated reconciliation and transparent settlement — handled for you.",
  },
] as const;

export const CLOSING_STATS = [
  { label: "Advance cost", value: "from 1.6%", sub: "priced across competing vaults" },
  { label: "Time to funded", value: "~30s", sub: "request to on-chain settlement" },
  { label: "Availability", value: "24/7", sub: "liquidity on-chain, anytime" },
] as const;

export const BEFORE_YOU_SIGN = [
  "Amount received",
  "Claim value assigned",
  "Total cost",
  "Selected vaults",
  "Retained balance",
  "Settlement status",
] as const;

export const WHY_MATURA = [
  {
    tag: "aggregate",
    title: "One unified account",
    body: "Draw against everything you're owed — not one invoice at a time.",
  },
  {
    tag: "compete",
    title: "Genuine best execution",
    body: "Vaults compete for your request. You get the cheapest route, not one quote.",
  },
  {
    tag: "right-size",
    title: "Only what you need",
    body: "Slice a claim — take $200 without financing the whole $2,000.",
  },
  {
    tag: "provable",
    title: "Provably fair pricing",
    body: "Same inputs, same route, every time. Auditable, not a black box.",
  },
  {
    tag: "non-custodial",
    title: "Non-custodial by design",
    body: "Matura prepares the transaction. Your keys and funds stay yours.",
  },
  {
    tag: "verifiable",
    title: "Verifiable settlement",
    body: "Every leg re-checked on-chain, then funded atomically.",
  },
] as const;

export const FAQ_ITEMS = [
  {
    q: "What exactly is a claim?",
    a: "A claim is a verified future payment — salary, a cleared freelance invoice, a marketplace payout, or an onchain stream — attested by an approved issuer or onchain adapter. It records the amount, beneficiary, and expected payment date.",
  },
  {
    q: "Is Matura custodial? Does it hold my funds or keys?",
    a: "No. The API only prepares unsigned calldata and EIP-712 typed data. You sign in your own wallet, funds move via the onchain router, and Matura never holds your key or custody of your money.",
  },
  {
    q: "How does best execution pick a route?",
    a: "A pure integer optimizer compares eligible vaults — including partial claim slices — and selects the cheapest verifiable combination. Its off-chain checks mirror the Solidity validation, so the quote is exactly what the contract funds. Identical inputs at the same block yield a byte-identical route.",
  },
  {
    q: "Is my invoice data exposed onchain?",
    a: "No. Issuers stay the source of truth for offchain payment rights. The chain records rights and value flows — claim state, vault accounting, route authorization, settlement — not your private documents.",
  },
  {
    q: "What happens at maturity?",
    a: "You receive liquidity now. At maturity the issuer pays Matura Protocol, which settles the selected vaults under a conservation check and returns any unassigned balance to you.",
  },
  {
    q: "Is this real money?",
    a: "Not yet. The current release is a testnet prototype on BNB Smart Chain Testnet using synthetic claims and mock assets — for demonstration only, not for production value.",
  },
] as const;

/** The feature `kind`s rendered by the issuer visuals. */
export type IssuerKind = (typeof ISSUER_FEATURES)[number]["kind"];
