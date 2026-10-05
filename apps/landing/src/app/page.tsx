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

const FLOW_STEPS = [
  {
    title: "Verify",
    body: "An approved issuer or onchain adapter attests to the amount, beneficiary, and expected payment date. The claim lands in your account.",
  },
  {
    title: "Compare",
    body: "The router prices eligible vaults against your request — including partial claim slices — and pins claim state and liquidity at a block.",
  },
  {
    title: "Route",
    body: "You review the cheapest verifiable route — amount, cost, vaults, retained balance — then sign it as EIP-712 typed data. Non-custodial.",
  },
  {
    title: "Settle",
    body: "executeRoute re-checks every leg onchain and funds atomically. At maturity the issuer pays and settlement is conservation-checked.",
  },
] as const;

const ROUTER_FEATURES = [
  {
    tag: "optimizer",
    title: "Pure integer optimizer",
    body: "bigint-only, no floats: a bounded exact search with a greedy fallback, in framework-free @matura/shared.",
  },
  {
    tag: "deterministic",
    title: "Byte-identical routes",
    body: "Identical inputs at the same pinned block always yield the same route — ranked by cost, then fewer legs, then lower face.",
  },
  {
    tag: "trust-minimized",
    title: "No quote-vs-execution gap",
    body: "The API's off-chain leg validation mirrors the Solidity _validateLegs, so what you're quoted is exactly what the contract funds.",
  },
  {
    tag: "single-use",
    title: "Single-use intents",
    body: "A route is persisted as a short-lived intent, re-validated against a fresh block, emitted to sign — and consumed exactly once.",
  },
] as const;

const ONCHAIN_LAYERS = [
  { title: "Claim state", body: "Issuer-authorized, revocable, traceable." },
  { title: "Vault accounting", body: "Liquidity and reservations, checkable by anyone." },
  { title: "Route authorization", body: "EIP-712 signatures bind exactly what will execute." },
  { title: "Settlement", body: "Atomic funding and conservation-checked settlement." },
] as const;

const ISSUER_BENEFITS = [
  "Signed claim issuance",
  "Configurable eligibility",
  "Automated reconciliation",
  "Transparent settlement reporting",
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
        className="relative -mt-[5.5rem] overflow-hidden pt-[8rem] sm:pt-36"
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

          <div className="animate-rise mt-8 w-full [--rise-delay:300ms]">
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
        <Container>
          <Eyebrow>How it works</Eyebrow>
          <DisplayHeading className="mt-5 max-w-[20ch] text-midnight">
            From verified payment to usable liquidity.
          </DisplayHeading>

          <div className="relative mt-14">
            <span
              aria-hidden
              className="absolute left-[19px] bottom-6 top-6 w-px bg-midnight/15 md:hidden"
            />
            <span
              aria-hidden
              className="absolute left-[12.5%] right-[12.5%] top-5 hidden h-px bg-midnight/15 md:block"
            />
            <ol className="grid gap-8 md:grid-cols-4">
              {FLOW_STEPS.map((step, index) => (
                <li key={step.title} className="relative flex gap-4 md:flex-col md:gap-4">
                  <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-liquid-mint font-mono text-sm font-bold text-midnight ring-4 ring-mist">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="flex flex-col gap-2">
                    <h3 className="font-heading text-lg font-semibold text-midnight">
                      {step.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-midnight/70">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Container>
      </Section>

      {/* 6 — Best-execution router (the differentiator) */}
      <Section tone="card" className="border-y border-midnight/10">
        <Container className="flex flex-col gap-12">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
            <div className="flex flex-col gap-5">
              <Eyebrow>The router</Eyebrow>
              <DisplayHeading className="text-midnight">
                One request. Competing liquidity. A better route.
              </DisplayHeading>
              <Lede>
                Instead of forcing an entire invoice into one facility, Matura compares eligible
                vaults and can combine partial claim slices to meet exactly the amount you requested
                at the lowest executable cost.
              </Lede>
              <ul className="flex flex-wrap gap-2 pt-1">
                {[
                  "Partial claim slicing",
                  "Multi-vault comparison",
                  "Deterministic settlement",
                ].map((point) => (
                  <li key={point}>
                    <Badge variant="outline" className="border-midnight/20 text-midnight">
                      {point}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mx-auto w-full max-w-sm lg:mx-0 lg:ml-auto">
              <HeroScene />
            </div>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROUTER_FEATURES.map((feature) => (
              <Panel key={feature.tag} as="li" className="flex flex-col gap-2">
                <MonoTag>{feature.tag}</MonoTag>
                <h3 className="font-heading text-base font-semibold text-midnight">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-midnight/70">{feature.body}</p>
              </Panel>
            ))}
          </ul>
        </Container>
      </Section>

      {/* 7 — Why onchain */}
      <Section tone="mist">
        <Container className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Eyebrow>Why onchain</Eyebrow>
            <DisplayHeading className="mt-5 text-midnight">
              A shared settlement layer for rights that begin elsewhere.
            </DisplayHeading>
            <Lede className="mt-5">
              Issuers stay the source of truth for offchain payment rights. BNB Chain records rights
              and value flows — not your private invoices — so every funded slice is auditable
              without exposing documents onchain.
            </Lede>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-7">
            {ONCHAIN_LAYERS.map((layer) => (
              <Panel key={layer.title} as="li" className="flex flex-col gap-2">
                <h3 className="font-heading text-base font-semibold text-midnight">
                  {layer.title}
                </h3>
                <p className="text-sm text-midnight/70">{layer.body}</p>
              </Panel>
            ))}
          </ul>
        </Container>
      </Section>

      {/* 8 — Live diagnostics (real testnet deployment) */}
      <Section id="protocol" tone="card" className="border-y border-midnight/10">
        <Container className="flex flex-col gap-10">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <Eyebrow>Live on BNB Testnet</Eyebrow>
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

      {/* 9 — For issuers */}
      <Section id="issuers" tone="mist">
        <Container className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-5">
            <Eyebrow>For platforms and issuers</Eyebrow>
            <DisplayHeading className="text-midnight">
              Make approved payouts useful before payday.
            </DisplayHeading>
            <Lede>
              Payroll providers, freelance platforms, marketplaces, and creator tools can offer
              faster access to approved payouts — without building a financing stack for every
              payout type. Each integration brings a whole population of payouts.
            </Lede>
            <div className="pt-1">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                Talk to the team
              </a>
            </div>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {ISSUER_BENEFITS.map((benefit) => (
              <Panel key={benefit} as="li" className="flex-row items-center gap-3">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-pill bg-liquid-mint" />
                <span className="text-sm font-medium text-midnight">{benefit}</span>
              </Panel>
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
              Built for transparency from the first transaction.
            </DisplayHeading>
            <div className="pt-6">
              <Badge variant="warning">Testnet prototype · synthetic claims</Badge>
            </div>
          </div>
          <div className="flex flex-col gap-6 lg:col-span-7 lg:pt-2">
            <Lede className="max-w-[60ch] text-xl">
              You see the full picture before you sign. The current release is a testnet prototype
              using synthetic claims and mock assets — not for production value.
            </Lede>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {BEFORE_YOU_SIGN.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 rounded-card border border-midnight/10 px-3 py-2 text-sm text-midnight/75"
                >
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-pill bg-liquid-mint" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      {/* 11 — FAQ */}
      <Section id="faq" tone="mist">
        <Container className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Eyebrow>FAQ</Eyebrow>
            <DisplayHeading className="mt-5 text-midnight">Questions, answered.</DisplayHeading>
          </div>
          <ul className="flex flex-col gap-3 lg:col-span-8">
            {FAQ_ITEMS.map((item) => (
              <li key={item.q}>
                <details className="group rounded-card border border-midnight/10 bg-background p-5 transition-colors hover:border-liquid-mint/50 open:border-midnight/15">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-heading text-base font-semibold text-midnight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span
                      aria-hidden
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-pill border border-midnight/20 text-midnight/60 transition-transform duration-200 group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-midnight/70">
                    {item.a}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* 12 — Terminal contact close */}
      <Section id="contact" tone="card" className="border-y border-midnight/10">
        <Container className="max-w-3xl">
          <Panel className="flex flex-col gap-6 p-8 sm:p-10">
            <MonoTag>matura ~ %</MonoTag>
            <DisplayHeading className="text-midnight">
              Stop waiting for what is already yours.
            </DisplayHeading>
            <Lede className="max-w-[52ch]">
              Explore how verified future payments become efficient, transparent, verifiable
              liquidity.
            </Lede>
            <div className="flex flex-wrap items-center gap-3">
              <a href={APP_URL} className={cn(buttonVariants({ size: "lg" }))}>
                Open Matura
              </a>
              <a
                href={GITHUB_DOCS.architecture}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                Read the architecture
              </a>
            </div>
          </Panel>
        </Container>
      </Section>
    </>
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
