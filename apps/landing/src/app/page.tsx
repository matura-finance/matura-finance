import { Badge } from "@matura/ui/components/badge";
import { buttonVariants } from "@matura/ui/components/button";
import { cn } from "@matura/ui/lib/utils";
import Image from "next/image";

import {
  Container,
  DisplayHeading,
  Eyebrow,
  Lede,
  MonoTag,
  Panel,
  Section,
} from "../components/marketing";
import { HeroScene } from "../components/hero-scene";
import { HeroDashboard } from "../components/hero-dashboard";
import { ClaimGallery } from "../components/claim-gallery";
import { FlowSteps } from "../components/flow-steps";
import { Testimonials } from "../components/testimonials";
import {
  APP_URL,
  bscScanAddress,
  BSCSCAN_TESTNET_URL,
  CHAIN_ID,
  CONTACT_EMAIL,
  DEPLOYMENT_BLOCK,
  GITHUB_DOCS,
  TESTNET_CONTRACTS,
  TESTNET_VAULTS,
} from "../lib/site";

const PROBLEM_FLAWS = [
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
const ROUTER_ACCORDION = [
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

const ONCHAIN_LAYERS = [
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

const LAYER_ICON_PATHS: Record<string, string> = {
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 15l2 2 4-4",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4",
  key: "M15.5 7.5a4 4 0 1 0-4.9 3.9L3 19v2h2l1-1h2v-2h2l1.6-1.6a4 4 0 0 0 3.9-4.9z M18 7h.01",
  swap: "M8 3 4 7l4 4 M4 7h16 M16 21l4-4-4-4 M20 17H4",
};

const ISSUER_FEATURES = [
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

const CLOSING_STATS = [
  { label: "Advance cost", value: "from 1.6%", sub: "priced across competing vaults" },
  { label: "Time to funded", value: "~30s", sub: "request to on-chain settlement" },
  { label: "Availability", value: "24/7", sub: "liquidity on-chain, anytime" },
] as const;

const BEFORE_YOU_SIGN = [
  "Amount received",
  "Claim value assigned",
  "Total cost",
  "Selected vaults",
  "Retained balance",
  "Settlement status",
] as const;

const WHY_MATURA = [
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

const FAQ_ITEMS = [
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

export default function HomePage() {
  return (
    <>
      {/* 1 — Hero — pulled up behind the floating nav so its background sits under it */}
      <Section
        id="top"
        tone="mist"
        className="relative -mt-[5.5rem] overflow-hidden pt-44 sm:pt-52"
      >
        <HeroBackdrop />
        <Container className="relative flex flex-col items-center gap-6 text-center">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-2 rounded-pill border border-midnight/10 bg-background px-1.5 py-1 shadow-sm">
              <span className="rounded-pill bg-liquid-mint px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-deep-night">
                New
              </span>
              <span className="pr-1.5 text-sm font-medium text-midnight/80">
                Best-execution routing, live on BNB Testnet
              </span>
            </span>
          </div>

          <DisplayHeading
            as="h1"
            className="animate-rise max-w-[16ch] text-midnight [--rise-delay:60ms]"
          >
            Liquidity for what you&apos;ve already earned.
          </DisplayHeading>

          <Lede className="animate-rise max-w-[46ch] text-xl [--rise-delay:120ms]">
            Turn income you&apos;ve earned into cash today — routed across competing vaults for the
            best rate, verified onchain.
          </Lede>

          <div className="animate-rise flex flex-wrap items-center justify-center gap-3 [--rise-delay:180ms]">
            <a href={APP_URL} className={cn(buttonVariants({ size: "lg" }))}>
              Open Matura
            </a>
            <a
              href="#how-it-works"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              See How It Works
            </a>
          </div>

          <div className="animate-rise flex items-center gap-2.5 [--rise-delay:240ms]">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-midnight/50">
              Built on
            </span>
            <Image
              src="/logos/bnb/bnb-chain-black.png"
              alt="BNB Chain"
              width={114}
              height={20}
              unoptimized
            />
          </div>

          <div className="animate-rise mt-20 w-full [--rise-delay:300ms]">
            <HeroDashboard />
          </div>
        </Container>
      </Section>

      {/* 2 — Problem */}
      <Section id="problem" tone="card" className="border-y border-midnight/10">
        <Container className="flex flex-col gap-12">
          <div className="flex flex-col gap-5">
            <Eyebrow>Value, stuck in time</Eyebrow>
            <DisplayHeading className="text-midnight">
              You&apos;ve earned it.
              <br />
              You just can&apos;t use it yet.
            </DisplayHeading>
            <Lede className="max-w-[60ch] text-xl">
              Your income is yours before it&apos;s spendable. Early-payout products don&apos;t
              close that gap — they&apos;re built on three broken defaults.
            </Lede>
          </div>

          <ul className="grid gap-4 md:grid-cols-3">
            {PROBLEM_FLAWS.map((flaw) => (
              <li
                key={flaw.tag}
                className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-midnight/10 bg-mist p-7 transition-colors hover:border-liquid-mint/50"
              >
                <FeatureMosaic />
                <h3 className="relative font-heading text-lg font-semibold text-midnight">
                  {flaw.title}
                </h3>
                <p className="relative text-sm leading-relaxed text-midnight/70">{flaw.body}</p>
                <p className="relative mt-auto border-t border-midnight/10 pt-3 text-xs text-midnight/50">
                  Hurts: {flaw.who}
                </p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* 3 — Unified account */}
      <Section tone="mist">
        <Container className="flex flex-col gap-10">
          <div className="flex flex-col gap-5">
            <Eyebrow>Matura Account</Eyebrow>
            <DisplayHeading className="text-midnight">
              Every verified payment. One liquidity account.
            </DisplayHeading>
            <Lede className="max-w-[60ch] text-xl">
              See all of your eligible claims in one place — the full earned-but-unpaid position,
              not one invoice at a time. Anything that&apos;s verifiable future income can become a
              routable claim.
            </Lede>
          </div>

          <ClaimGallery />
        </Container>
      </Section>

      {/* 4 — Why Matura (advantages) */}
      <Section id="why" tone="card" className="border-y border-midnight/10">
        <Container className="flex flex-col gap-14">
          <div className="flex flex-col gap-5">
            <span className="w-fit rounded-pill bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
              Why Matura
            </span>
            <DisplayHeading className="text-midnight">
              Cheaper, fairer, verifiable — by construction.
            </DisplayHeading>
            <Lede className="max-w-[60ch] text-xl">
              Not a better rate on a broken model — a different market structure entirely.
            </Lede>
          </div>

          <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_MATURA.map((item) => (
              <li key={item.tag} className="flex gap-3">
                <CheckIcon />
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-heading text-base font-semibold text-midnight">
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-midnight/60">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* 5 — How it works */}
      <Section id="how-it-works" tone="mist">
        <Container className="flex flex-col gap-14">
          <div className="flex flex-col gap-5">
            <span className="w-fit rounded-pill bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
              How It Works
            </span>
            <DisplayHeading className="text-midnight lg:whitespace-nowrap">
              From verified payment to usable liquidity.
            </DisplayHeading>
          </div>

          <FlowSteps />
        </Container>
      </Section>

      {/* 6 — Best-execution router (the differentiator) */}
      <Section tone="card" className="border-y border-midnight/10">
        <Container className="grid gap-12 lg:grid-cols-2 lg:items-center">
          {/* Reserve a stable height so expanding/collapsing the accordion doesn't
              shift the vertically-centred visual on the right. */}
          <div className="flex flex-col gap-8 lg:min-h-[42rem]">
            <div className="flex flex-col gap-5">
              <Eyebrow>The router</Eyebrow>
              <DisplayHeading className="text-midnight">
                One request.
                <br />
                Competing liquidity.
                <br />A better route.
              </DisplayHeading>
            </div>

            <ul className="flex flex-col divide-y divide-midnight/10">
              {ROUTER_ACCORDION.map((item, index) => (
                <li key={item.title}>
                  <details className="group" name="router-accordion" open={index === 0}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-heading text-lg font-semibold text-midnight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                      {item.title}
                      <ChevronIcon />
                    </summary>
                    <p className="max-w-[52ch] pb-5 pr-8 text-sm leading-relaxed text-midnight/60">
                      {item.body}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-midnight/10 bg-mist p-8 sm:p-12">
            <div className="mx-auto w-full max-w-sm">
              <HeroScene />
            </div>
          </div>
        </Container>
      </Section>

      {/* 7 — Why onchain */}
      <Section tone="mist">
        <Container className="flex flex-col gap-12">
          <div className="flex flex-col gap-5">
            <Eyebrow>Why Onchain</Eyebrow>
            <DisplayHeading className="text-midnight">
              Verifiable by anyone. Private to you.
            </DisplayHeading>
            <Lede className="max-w-[60ch] text-xl">
              The chain records the rights and value flows — never your private invoices. Every
              funded slice stays auditable; your documents stay off-chain.
            </Lede>
          </div>

          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ONCHAIN_LAYERS.map((layer) => (
              <li
                key={layer.key}
                className={cn(
                  "group relative h-72 overflow-hidden rounded-2xl ring-1 ring-midnight/10 sm:h-80",
                  layer.span,
                )}
              >
                <Image
                  src={`/onchain/${layer.key}.jpg`}
                  alt=""
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 40vw"
                  className="object-cover grayscale transition duration-500 ease-out group-hover:scale-[1.04] group-hover:grayscale-0"
                />
                <span
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/5"
                />
                <span className="absolute left-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur">
                  <svg
                    aria-hidden
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={LAYER_ICON_PATHS[layer.icon]} />
                  </svg>
                </span>
                <div className="absolute inset-x-0 bottom-0 p-6">
                  <h3 className="font-heading text-xl font-bold text-white">{layer.title}</h3>
                  <p className="mt-1.5 max-w-[46ch] text-sm leading-relaxed text-white/75">
                    {layer.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* 8 — Live diagnostics (real testnet deployment) */}
      <Section id="protocol" tone="card" className="border-y border-midnight/10">
        <Container className="flex flex-col gap-10">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <span className="w-fit rounded-pill bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                Live on BNB Testnet
              </span>
              <DisplayHeading className="mt-5 text-midnight">
                Verifiable execution, from claim to settlement.
              </DisplayHeading>
              <Image
                src="/logos/bnb/bnb-chain-black.png"
                alt="BNB Chain"
                width={137}
                height={24}
                unoptimized
                className="mt-6"
              />
            </div>
            <div className="lg:col-span-4 lg:text-right">
              <a
                href={`${BSCSCAN_TESTNET_URL}/address/${TESTNET_CONTRACTS[0].address}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                Inspect on BscScan
              </a>
            </div>
          </div>

          <DiagnosticsPanel />
        </Container>
      </Section>

      {/* 9 — For platforms & issuers */}
      <Section id="issuers" tone="mist">
        <Container className="flex flex-col gap-14">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="w-fit rounded-pill bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
              For Platforms &amp; Issuers
            </span>
            <DisplayHeading className="text-midnight">
              Make payouts useful before payday.
            </DisplayHeading>
            <Lede className="max-w-[62ch]">
              Payroll, freelance, marketplace, and creator platforms can give users instant access
              to approved payouts — no financing stack to build. One integration covers them all.
            </Lede>
            <div className="pt-2">
              <a href={`mailto:${CONTACT_EMAIL}`} className={cn(buttonVariants({ size: "lg" }))}>
                Talk to the Team
              </a>
            </div>
          </div>

          <ul className="grid gap-8 lg:grid-cols-3">
            {ISSUER_FEATURES.map((feature) => (
              <li key={feature.kind} className="flex flex-col gap-5">
                <div className="flex h-72 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#111827] via-[#1f2b45] to-[#2a78d6] p-8">
                  <IssuerVisual kind={feature.kind} />
                </div>
                <div>
                  <h3 className="font-heading text-xl font-bold text-midnight">{feature.title}</h3>
                  <p className="mt-2 leading-relaxed text-midnight/60">{feature.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* 10 — Safety & scope */}
      <Section tone="card" className="border-y border-midnight/10">
        <Container className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Eyebrow>Safety &amp; scope</Eyebrow>
            <DisplayHeading className="mt-5 text-midnight">
              You hold the keys. You see everything.
            </DisplayHeading>
            <div className="pt-6">
              <Badge variant="warning">Testnet Prototype · Synthetic Claims</Badge>
            </div>
          </div>
          <div className="flex flex-col gap-6 lg:col-span-7 lg:pt-2">
            <Lede className="max-w-[60ch] text-xl">
              Matura only prepares what you sign — never your keys, never your funds. Every leg is
              re-checked on-chain, and every settlement is conservation-checked.
            </Lede>
            <div className="flex flex-col gap-3">
              <MonoTag>Visible before you sign</MonoTag>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BEFORE_YOU_SIGN.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 rounded-card border border-midnight/10 px-3 py-2 text-sm text-midnight/75"
                  >
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-pill bg-liquid-mint"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </Section>

      {/* 11 — Testimonials */}
      <Section id="testimonials" tone="mist">
        <Container className="flex flex-col gap-12">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="w-fit rounded-pill bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
              Testimonials
            </span>
            <DisplayHeading className="text-midnight">What our users say</DisplayHeading>
            <Lede className="max-w-[48ch]">
              Early users on turning verified income into instant, fairly-priced liquidity.
            </Lede>
          </div>
          <Testimonials />
        </Container>
      </Section>

      {/* 12 — FAQ */}
      <Section id="faq" tone="card" className="border-y border-midnight/10">
        <Container className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Eyebrow>FAQ</Eyebrow>
            <DisplayHeading className="mt-5 text-midnight">Questions, answered.</DisplayHeading>
          </div>
          <ul className="flex flex-col gap-3 lg:col-span-8">
            {FAQ_ITEMS.map((item) => (
              <li key={item.q}>
                <details
                  className="group rounded-card border border-midnight/10 bg-background transition-colors hover:border-liquid-mint/50 open:border-liquid-mint/50"
                  name="faq"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-card p-5 font-heading text-base font-semibold text-midnight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronIcon />
                  </summary>
                  <p className="-mt-1 max-w-[68ch] px-5 pb-5 text-sm leading-relaxed text-midnight/70">
                    {item.a}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* 13 — Closing CTA with stats */}
      <Section id="contact" tone="mist" className="border-t border-midnight/10">
        <Container className="flex flex-col items-center gap-16">
          <ul className="grid w-full gap-5 sm:grid-cols-3">
            {CLOSING_STATS.map((stat) => (
              <li
                key={stat.label}
                className="flex h-56 flex-col justify-between rounded-2xl border border-midnight/10 bg-background p-8 shadow-sm"
              >
                <span className="text-sm text-midnight/50">{stat.label}</span>
                <div>
                  <div className="font-heading text-5xl font-bold tracking-tight text-midnight">
                    {stat.value}
                  </div>
                  <span className="mt-2 block text-sm text-midnight/55">{stat.sub}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-col items-center gap-5 text-center">
            <DisplayHeading className="text-midnight">
              Stop waiting for what&apos;s already yours.
            </DisplayHeading>
            <Lede className="max-w-[46ch] text-xl">
              Verified income, turned into instant, fairly-priced liquidity.
            </Lede>
            <div className="flex flex-col items-center gap-4 pt-2">
              <a href={APP_URL} className={cn(buttonVariants({ size: "lg" }))}>
                Open Matura
              </a>
              <a
                href={GITHUB_DOCS.architecture}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-midnight/60 underline-offset-4 transition-colors hover:text-midnight hover:underline"
              >
                Read the architecture →
              </a>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}

/**
 * Built mini-illustrations for the issuer feature cards — a signed claim, an
 * eligibility-rules panel, and a settlement chart. White cards on the brand
 * gradient; purely presentational, so `aria-hidden`.
 */
function IssuerVisual({ kind }: { kind: string }) {
  if (kind === "sign") {
    return (
      <div
        aria-hidden
        className="w-full max-w-[16rem] rounded-xl bg-background p-4 shadow-xl shadow-black/20"
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-midnight/50">
            Payroll · May
          </span>
          <span className="inline-flex items-center gap-1 rounded-pill bg-liquid-mint/20 px-2 py-0.5 text-[11px] font-semibold text-midnight">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Signed
          </span>
        </div>
        <div className="mt-3 font-heading text-2xl font-bold tabular-nums text-midnight">
          $3,200.00
        </div>
        <div className="mt-1 text-xs text-midnight/45">Payee 0x9f…7bE · due Jun 1</div>
      </div>
    );
  }

  if (kind === "rules") {
    const rules = [
      { label: "Max advance", value: "80%", on: true },
      { label: "KYC verified", value: "", on: true },
      { label: "Vault allowlist", value: "", on: false },
    ];
    return (
      <div
        aria-hidden
        className="flex w-full max-w-[16rem] flex-col gap-3.5 rounded-xl bg-background p-4 shadow-xl shadow-black/20"
      >
        {rules.map((rule) => (
          <div key={rule.label} className="flex items-center justify-between gap-3">
            <span className="text-sm text-midnight/70">{rule.label}</span>
            <span className="flex items-center gap-2">
              {rule.value ? (
                <span className="font-mono text-xs text-midnight/45">{rule.value}</span>
              ) : null}
              <span
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  rule.on ? "bg-liquid-mint" : "bg-midnight/15",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow",
                    rule.on ? "left-[18px]" : "left-0.5",
                  )}
                />
              </span>
            </span>
          </div>
        ))}
      </div>
    );
  }

  const bars = [40, 55, 35, 70, 52, 100, 62, 44, 80, 38];
  return (
    <div
      aria-hidden
      className="w-full max-w-[16rem] rounded-xl bg-background p-4 shadow-xl shadow-black/20"
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-midnight/50">
        Settled · May
      </span>
      <div className="mt-1 font-heading text-2xl font-bold tabular-nums text-midnight">$48,200</div>
      <div className="mt-3 flex h-20 items-end gap-1.5">
        {bars.map((height, index) => (
          <span
            key={`bar-${String(index)}`}
            className={cn("flex-1 rounded-t-sm", index === 5 ? "bg-liquid-mint" : "bg-midnight/15")}
            style={{ height: `${String(height)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Chevron for the router accordion summaries. Points down when closed and flips
 * up when its parent <details class="group"> is open.
 */
function ChevronIcon() {
  return (
    <svg
      aria-hidden
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-midnight/40 transition-transform duration-200 group-open:rotate-180"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Checklist tick for the Why-Matura grid. Liquid Mint is contrast-legal here
 * because it's a tick/fill, never copy. Nudged down to sit on the title line.
 */
function CheckIcon() {
  return (
    <svg
      aria-hidden
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-liquid-mint"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * Decorative pixel-grid mosaic that fades in from a card's top-right corner —
 * the subtle texture on the problem cards. Brand ink (Midnight) at very low
 * opacity, radially masked so it dissolves toward the card body. Presentational,
 * so `aria-hidden`.
 */
function FeatureMosaic() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-0 top-0 h-28 w-28"
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(17,24,39,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(17,24,39,0.07) 1px, transparent 1px)",
        backgroundSize: "14px 14px",
        maskImage: "radial-gradient(circle at top right, black, transparent 72%)",
        WebkitMaskImage: "radial-gradient(circle at top right, black, transparent 72%)",
      }}
    >
      <span className="absolute right-5 top-4 h-3 w-3 bg-midnight/[0.06]" />
      <span className="absolute right-12 top-8 h-2.5 w-2.5 bg-midnight/[0.05]" />
      <span className="absolute right-6 top-12 h-2 w-2 bg-midnight/[0.04]" />
    </span>
  );
}

/**
 * Decorative hero backdrop — soft, blurred brand-color washes behind the centered
 * hero. Brand palette only (Liquid Mint + the vault ramp), kept low-opacity so ink
 * copy stays AA on Mist. Purely presentational, so `aria-hidden` and non-interactive.
 */
function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-[var(--color-vault-1)]/10 blur-3xl" />
      <div className="absolute -right-16 top-10 h-[24rem] w-[24rem] rounded-full bg-liquid-mint/15 blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-mist" />
    </div>
  );
}

/**
 * Live-deployment readout: real BSC-Testnet contract addresses (mirrored from the
 * committed manifest) with BscScan proof links, styled as an instrument panel.
 * Fully static — no runtime fetch. Live vault liquidity can be layered on later
 * via the public `GET /api/v1/vaults` read endpoint (see docs plan). On Mist,
 * Liquid Mint appears only as fills/ticks (contrast law), never as copy.
 */
function DiagnosticsPanel() {
  return (
    <Panel className="flex flex-col gap-8 p-6 sm:p-8">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[
          { k: "Network", v: `BNB Testnet (${String(CHAIN_ID)})` },
          { k: "Status", v: "Live", dot: true },
          { k: "Core contracts", v: `${String(TESTNET_CONTRACTS.length)} deployed` },
          { k: "Live since block", v: DEPLOYMENT_BLOCK },
        ].map((stat) => (
          <div key={stat.k} className="flex flex-col gap-1">
            <dt className="font-mono text-xs uppercase tracking-[0.14em] text-midnight/45">
              {stat.k}
            </dt>
            <dd className="flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums text-midnight">
              {stat.dot ? (
                <span aria-hidden className="h-2 w-2 rounded-full bg-liquid-mint" />
              ) : null}
              {stat.v}
            </dd>
          </div>
        ))}
      </dl>

      <ul className="flex flex-col divide-y divide-midnight/10 border-y border-midnight/10">
        {TESTNET_CONTRACTS.map((contract) => (
          <li key={contract.key}>
            <a
              href={bscScanAddress(contract.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col gap-1 py-3 transition-colors hover:bg-midnight/[0.03] sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex flex-col gap-0.5">
                <span className="font-heading text-sm font-semibold text-midnight group-hover:underline">
                  {contract.label}
                </span>
                <span className="text-xs text-midnight/50">{contract.note}</span>
              </span>
              <span className="font-mono text-xs text-midnight/45 group-hover:text-midnight/70">
                {contract.address}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <MonoTag className="mr-1 self-center">Vaults</MonoTag>
        {TESTNET_VAULTS.map((vault) => (
          <a
            key={vault.key}
            href={bscScanAddress(vault.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-pill border border-midnight/20 px-3 py-1 text-xs font-medium text-midnight/80 transition-colors hover:border-liquid-mint/60 hover:text-midnight"
          >
            {vault.label}
          </a>
        ))}
      </div>
    </Panel>
  );
}
