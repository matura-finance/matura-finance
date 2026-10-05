import { Badge } from "@matura/ui/components/badge";
import { buttonVariants } from "@matura/ui/components/button";
import { cn } from "@matura/ui/lib/utils";
import Image from "next/image";

import { ClaimGallery } from "../components/claim-gallery";
import { FlowSteps } from "../components/flow-steps";
import { HeroDashboard } from "../components/hero-dashboard";
import { HeroScene } from "../components/hero-scene";
import {
  Container,
  DisplayHeading,
  Eyebrow,
  Lede,
  MonoTag,
  Section,
} from "../components/marketing";
import {
  CheckIcon,
  ChevronIcon,
  DiagnosticsPanel,
  FeatureMosaic,
  HeroBackdrop,
  IssuerVisual,
} from "../components/section-visuals";
import { Testimonials } from "../components/testimonials";
import {
  BEFORE_YOU_SIGN,
  CLOSING_STATS,
  FAQ_ITEMS,
  ISSUER_FEATURES,
  LAYER_ICON_PATHS,
  ONCHAIN_LAYERS,
  PROBLEM_FLAWS,
  ROUTER_ACCORDION,
  WHY_MATURA,
} from "../lib/landing-content";
import {
  APP_URL,
  bscScanAddress,
  CONTACT_EMAIL,
  GITHUB_DOCS,
  TESTNET_CONTRACTS,
} from "../lib/site";

export default function HomePage() {
  return (
    <>
      {/* 1 — Hero — pulled up behind the floating nav so its background sits under it */}
      <Section
        id="top"
        tone="mist"
        reveal={false}
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
                  src={`/onchain/${layer.key}.webp`}
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
                href={bscScanAddress(TESTNET_CONTRACTS[0].address)}
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
