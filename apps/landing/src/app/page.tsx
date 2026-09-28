import { AllocationBar } from "@matura/ui/components/allocation-bar";
import { Badge } from "@matura/ui/components/badge";
import { buttonVariants } from "@matura/ui/components/button";
import { Card } from "@matura/ui/components/card";
import { cn } from "@matura/ui/lib/utils";
import Link from "next/link";

import { DisplayHeading, Eyebrow, Lede, Section } from "../components/marketing";
import { APP_URL, BSCSCAN_TESTNET_URL, CONTRACTS_DEPLOYED } from "../lib/site";

const CLAIM_LABELS = [
  "Earned salary",
  "Approved freelance payout",
  "Marketplace settlement",
  "Onchain stream",
] as const;

const FLOW_STEPS = [
  {
    title: "Verify",
    body: "An approved issuer or onchain adapter confirms the amount, beneficiary, and expected payment date.",
  },
  {
    title: "Compare",
    body: "Matura Vaults return executable prices based on claim type, duration, liquidity, and risk limits.",
  },
  {
    title: "Route",
    body: "Matura Router selects the lowest-cost eligible combination and assigns only the claim slices required.",
  },
  {
    title: "Settle",
    body: "You receive liquidity now. At maturity, the issuer pays Matura Protocol, which settles the selected vaults and returns the unassigned balance to you.",
  },
] as const;

const EXECUTION_PROOF = [
  "Partial claim slicing",
  "Multi-vault comparison",
  "Deterministic settlement",
] as const;

const ISSUER_BENEFITS = [
  "Signed claim issuance",
  "Configurable eligibility",
  "Automated reconciliation",
  "Transparent settlement reporting",
] as const;

export default function HomePage() {
  return (
    <>
      {/* 1 — Hero */}
      <Section tone="mist" className="overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-gutter lg:grid-cols-12 lg:items-center">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <div className="animate-rise">
              <Eyebrow>Future Income Liquidity</Eyebrow>
            </div>
            <DisplayHeading as="h1" className="animate-rise text-midnight [--rise-delay:60ms]">
              Liquidity for what you&apos;ve already earned.
            </DisplayHeading>
            <Lede className="animate-rise [--rise-delay:120ms]">
              Matura brings verified future payments into one account, assigns only what you need,
              and routes each request to the most efficient onchain liquidity.
            </Lede>
            <div className="animate-rise flex flex-wrap items-center gap-3 [--rise-delay:180ms]">
              <a href={APP_URL} className={cn(buttonVariants({ size: "lg" }))}>
                Open Matura
              </a>
              <Link
                href="/how-it-works"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                See how it works
              </Link>
            </div>
            <p className="animate-rise text-sm text-midnight/60 [--rise-delay:240ms]">
              Built on BNB Chain · Verified claims · Transparent execution
            </p>
          </div>

          <div className="lg:col-span-5">
            <HeroVisual />
          </div>
        </div>
      </Section>

      {/* 2 — Problem */}
      <Section tone="card" className="border-y border-midnight/10">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-gutter lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Eyebrow>Value, stuck in time</Eyebrow>
            <DisplayHeading className="mt-5 text-midnight">
              You&apos;ve earned it. You just can&apos;t use it yet.
            </DisplayHeading>
          </div>
          <div className="lg:col-span-7 lg:pt-2">
            <Lede className="max-w-[60ch] text-xl">
              Salary, freelance payouts, refunds, marketplace earnings, and onchain streams often
              become yours before they become spendable. Existing products treat each payment
              separately—and make you accept one provider&apos;s price.
            </Lede>
          </div>
        </div>
      </Section>

      {/* 3 — Unified account */}
      <Section tone="mist">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-gutter lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-5">
            <Eyebrow>Matura account</Eyebrow>
            <DisplayHeading className="text-midnight">
              Every verified payment. One liquidity account.
            </DisplayHeading>
            <Lede>
              Matura gathers eligible future payments into a single view, so you can understand what
              is available now without losing sight of what remains yours.
            </Lede>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {CLAIM_LABELS.map((label) => (
              <li key={label}>
                <Card className="h-full gap-3 p-5">
                  <span aria-hidden className="h-1.5 w-6 rounded-full bg-liquid-mint" />
                  <span className="font-heading text-base font-semibold text-midnight">
                    {label}
                  </span>
                  <span className="text-sm text-midnight/60">Verified · Available to route</span>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* 4 — How it works */}
      <Section tone="card" className="border-y border-midnight/10">
        <div className="mx-auto w-full max-w-6xl px-gutter">
          <DisplayHeading className="max-w-[18ch] text-midnight">
            From verified payment to usable liquidity.
          </DisplayHeading>

          <div className="relative mt-14">
            <span
              aria-hidden
              className="absolute left-[19px] top-6 bottom-6 w-px bg-midnight/15 md:hidden"
            />
            <span
              aria-hidden
              className="absolute left-[12.5%] right-[12.5%] top-5 hidden h-px bg-midnight/15 md:block"
            />
            <ol className="grid gap-8 md:grid-cols-4">
              {FLOW_STEPS.map((step, index) => (
                <li key={step.title} className="relative flex gap-4 md:flex-col md:gap-4">
                  <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-liquid-mint font-heading text-sm font-bold text-midnight ring-4 ring-[var(--background)]">
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
        </div>
      </Section>

      {/* 5 — Best execution */}
      <Section tone="mist">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-gutter lg:grid-cols-2 lg:items-start">
          <div className="flex flex-col gap-5">
            <Eyebrow>More than early payout</Eyebrow>
            <DisplayHeading className="text-midnight">
              One request. Competing liquidity. A better route.
            </DisplayHeading>
            <Lede>
              Instead of forcing an entire invoice into one facility, Matura compares eligible
              vaults and can combine partial claim slices to meet the amount you requested at the
              lowest executable cost.
            </Lede>
            <ul className="flex flex-wrap gap-2 pt-1">
              {EXECUTION_PROOF.map((point) => (
                <li key={point}>
                  <Badge variant="outline" className="border-midnight/20 text-midnight">
                    {point}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>

          <ExecutionDiagram />
        </div>
      </Section>

      {/* 6 — Why blockchain */}
      <Section tone="card" className="border-y border-midnight/10">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-gutter lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Eyebrow>Why onchain</Eyebrow>
            <DisplayHeading className="mt-5 text-midnight">
              A shared settlement layer for rights that begin elsewhere.
            </DisplayHeading>
          </div>
          <div className="lg:col-span-7 lg:pt-2">
            <Lede className="max-w-[60ch] text-xl">
              Issuers remain the source of truth for offchain payment rights. BNB Chain provides a
              common execution layer for claim state, vault accounting, route authorization, and
              settlement—so every funded slice can be traced without exposing private documents
              onchain.
            </Lede>
          </div>
        </div>
      </Section>

      {/* 7 — Issuer */}
      <Section tone="mist">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-gutter lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-5">
            <Eyebrow>For platforms and issuers</Eyebrow>
            <DisplayHeading className="text-midnight">
              Make approved payouts useful before payday.
            </DisplayHeading>
            <Lede>
              Payroll providers, freelance platforms, marketplaces, and creator tools can offer
              faster access without building a separate financing stack for every payout type.
            </Lede>
            <div className="pt-1">
              <a
                href="mailto:team@usematura.xyz"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                Talk to the team
              </a>
            </div>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {ISSUER_BENEFITS.map((benefit) => (
              <li key={benefit}>
                <Card className="h-full flex-row items-center gap-3 p-5">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-liquid-mint" />
                  <span className="text-sm font-medium text-midnight">{benefit}</span>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* 8 — Protocol proof (Deep Night) */}
      <Section tone="deep-night">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-gutter lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <Eyebrow tone="dark">Matura Protocol</Eyebrow>
            <DisplayHeading className="mt-5 text-mist">
              Verifiable execution from claim to settlement.
            </DisplayHeading>
            <Lede tone="dark" className="mt-5 text-mist/70">
              Issuer-authorized Matura Claims, isolated Matura Vaults, onchain quote validation,
              atomic funding, and conservation-checked settlement on BNB Chain.
            </Lede>
          </div>
          <div className="lg:col-span-4 lg:text-right">
            {CONTRACTS_DEPLOYED ? (
              <a
                href={`${BSCSCAN_TESTNET_URL}/`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "border-mist/30 bg-transparent text-mist hover:bg-mist/10 hover:text-mist",
                )}
              >
                View contracts
              </a>
            ) : (
              <p className="text-sm font-medium text-liquid-mint">Contracts deploying soon</p>
            )}
          </div>
        </div>
      </Section>

      {/* 9 — Safety & scope */}
      <Section tone="mist">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-gutter lg:grid-cols-12">
          <div className="lg:col-span-5">
            <DisplayHeading className="text-midnight">
              Built for transparency from the first transaction.
            </DisplayHeading>
          </div>
          <div className="lg:col-span-7 lg:pt-2">
            <Lede className="max-w-[60ch] text-xl">
              Matura shows the amount received, claim value assigned, total cost, selected vaults,
              retained balance, and settlement status before execution. The current release is a
              testnet prototype using synthetic claims and mock assets.
            </Lede>
            <div className="pt-6">
              <Badge variant="warning">Testnet prototype · synthetic claims</Badge>
            </div>
          </div>
        </div>
      </Section>

      {/* 10 — Final CTA (Deep Night) */}
      <Section tone="deep-night">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-gutter text-center">
          <DisplayHeading className="text-mist">
            Stop waiting for what is already yours.
          </DisplayHeading>
          <Lede tone="dark" className="max-w-[50ch] text-center text-mist/70">
            Explore how verified future payments can become efficient, transparent liquidity.
          </Lede>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href={APP_URL} className={cn(buttonVariants({ size: "lg" }))}>
              Open Matura
            </a>
            <Link
              href="/protocol"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "border-mist/30 bg-transparent text-mist hover:bg-mist/10 hover:text-mist",
              )}
            >
              Read the protocol overview
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}

/**
 * Decorative hero visual — a CSS/SVG "one amount → allocated slices" schematic
 * in a fixed 4:5 slot (reserves layout, avoids CLS). Purely presentational: all
 * meaning lives in the hero copy, so the figure is `aria-hidden`.
 */
function HeroVisual() {
  return (
    <div className="animate-rise [--rise-delay:150ms]">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-card border border-midnight/10 bg-background p-6 shadow-sm">
        <figure aria-hidden className="flex h-full flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-midnight/50">
              One request
            </span>
            <span className="rounded-full bg-liquid-mint px-3 py-1 font-mono text-sm font-semibold text-midnight tabular-nums">
              10,000
            </span>
          </div>

          {/* Branching flow-line: ink strokes (mint hairlines are not AA on Mist). */}
          <svg viewBox="0 0 240 160" className="my-2 w-full" role="presentation">
            <g fill="none" stroke="currentColor" className="text-midnight/25" strokeWidth="1.5">
              <path className="animate-flow" d="M120 8 V44" />
              <path className="animate-flow" d="M120 44 C120 80 40 80 40 116" />
              <path className="animate-flow" d="M120 44 V116" />
              <path className="animate-flow" d="M120 44 C120 80 200 80 200 116" />
            </g>
            <g>
              <circle cx="40" cy="120" r="7" fill="var(--color-vault-1)" />
              <circle cx="120" cy="120" r="7" fill="var(--color-vault-2)" />
              <circle cx="200" cy="120" r="7" fill="var(--color-vault-3)" />
            </g>
          </svg>

          <div className="flex flex-col gap-3">
            <AllocationBar
              segments={[
                { key: "v1", label: "Vault A", widthPct: 46, colorVar: "--color-vault-1" },
                { key: "v2", label: "Vault B", widthPct: 30, colorVar: "--color-vault-2" },
              ]}
              retained={{ label: "Retained", widthPct: 24 }}
            />
            <div className="flex items-center justify-between text-xs text-midnight/60">
              <span>Best executable route</span>
              <span className="font-mono tabular-nums">3 vaults compared</span>
            </div>
          </div>
        </figure>
      </div>
    </div>
  );
}

/**
 * Static schematic for the "best execution" section: one amount split into two
 * financed slices (distinct vaults, each labeled with its rate) plus a retained
 * balance, alongside the verbatim comparison labels. Illustrative example only.
 */
function ExecutionDiagram() {
  const rows = [
    { label: "Amount needed", value: "10,000.00" },
    { label: "Selected claims", value: "2 slices" },
    { label: "Received now", value: "7,600.00" },
    { label: "Total cost", value: "180.00" },
    { label: "Retained balance", value: "2,400.00" },
  ] as const;

  return (
    <Card className="gap-6 p-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-midnight/50">
          Example route
        </span>
        <Badge variant="warning">Illustrative</Badge>
      </div>

      <AllocationBar
        segments={[
          { key: "vault-a", label: "Vault A · 1.6%", widthPct: 46, colorVar: "--color-vault-1" },
          { key: "vault-b", label: "Vault B · 2.1%", widthPct: 30, colorVar: "--color-vault-2" },
        ]}
        retained={{ label: "You retain", widthPct: 24 }}
      />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-3 border-b border-midnight/10 pb-2"
          >
            <dt className="text-sm text-midnight/60">{row.label}</dt>
            <dd className="font-mono text-sm font-medium tabular-nums text-midnight">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
