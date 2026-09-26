import { buttonVariants } from "@matura/ui/components/button";
import { Card } from "@matura/ui/components/card";
import { cn } from "@matura/ui/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";

import { DisplayHeading, Eyebrow, Lede, Section } from "../../components/marketing";
import { APP_URL } from "../../lib/site";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How Matura turns a verified future payment into usable liquidity: verification, portfolio, quote collection, partial slicing, route execution, and issuer settlement.",
  alternates: { canonical: "/how-it-works" },
};

const STEPS = [
  {
    title: "Verify",
    body: "An approved issuer or onchain adapter attests to a future payment—its amount, beneficiary, and expected settlement date. Only verified claims become eligible.",
  },
  {
    title: "Compare",
    body: "Matura Vaults quote executable prices for the claim based on its type, duration, available liquidity, and each vault's risk limits. Every quote is validated onchain.",
  },
  {
    title: "Route",
    body: "The Matura Router selects the lowest-cost eligible combination and assigns only the claim slices needed to reach the amount you requested—no more.",
  },
  {
    title: "Settle",
    body: "You receive liquidity now. At maturity the issuer pays Matura Protocol, which settles the selected vaults and returns any unassigned balance to you.",
  },
] as const;

const DETAIL = [
  {
    heading: "One portfolio of verified payments",
    body: "Salary, freelance payouts, marketplace settlements, and onchain streams land in a single account. You see total verified value, what is currently eligible to route, and what remains yours to collect at maturity.",
  },
  {
    heading: "Quote collection across vaults",
    body: "When you request an amount, Matura asks every eligible vault for an executable price. Prices reflect claim type, time to maturity, and vault liquidity—so you are never limited to a single provider's terms.",
  },
  {
    heading: "Partial claim slicing",
    body: "You rarely need to finance an entire payment. Matura assigns only the slices required to meet your requested amount and leaves the rest on its original schedule, still yours.",
  },
  {
    heading: "Deterministic route execution",
    body: "The router picks the lowest total cost, then you review exactly which vaults and slices were chosen before signing. Funding is atomic: either the whole route executes or nothing does.",
  },
  {
    heading: "Issuer settlement at maturity",
    body: "When the payment matures, the issuer pays Matura Protocol. The protocol settles the funded vaults and returns your retained balance—conservation-checked, and traceable onchain.",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <>
      <Section tone="mist">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-gutter">
          <Eyebrow>How it works</Eyebrow>
          <DisplayHeading as="h1" className="text-midnight">
            From verified payment to usable liquidity.
          </DisplayHeading>
          <Lede className="text-xl">
            Every request follows the same four steps. Nothing moves until a payment is verified,
            and settlement is handled by the protocol at maturity.
          </Lede>
        </div>
      </Section>

      <Section tone="card" className="border-y border-midnight/10 !pt-0 pb-[clamp(4rem,8vw,8rem)]">
        <div className="mx-auto w-full max-w-6xl px-gutter pt-[clamp(4rem,8vw,8rem)]">
          <div className="relative">
            <span
              aria-hidden
              className="absolute left-[19px] top-6 bottom-6 w-px bg-midnight/15 md:hidden"
            />
            <span
              aria-hidden
              className="absolute left-[12.5%] right-[12.5%] top-5 hidden h-px bg-midnight/15 md:block"
            />
            <ol className="grid gap-8 md:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="relative flex gap-4 md:flex-col">
                  <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-liquid-mint font-heading text-sm font-bold text-midnight ring-4 ring-[var(--background)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="flex flex-col gap-2">
                    <h2 className="font-heading text-lg font-semibold text-midnight">
                      {step.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-midnight/70">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      <Section tone="mist">
        <div className="mx-auto grid w-full max-w-5xl gap-5 px-gutter sm:grid-cols-2">
          {DETAIL.map((item) => (
            <Card key={item.heading} className="h-full gap-3 p-6">
              <h2 className="font-heading text-lg font-semibold text-midnight">{item.heading}</h2>
              <p className="text-sm leading-relaxed text-midnight/70">{item.body}</p>
            </Card>
          ))}
          <div className="flex items-center sm:col-span-2">
            <a href={APP_URL} className={cn(buttonVariants({ size: "lg" }))}>
              Open Matura
            </a>
            <Link
              href="/protocol"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "ml-3")}
            >
              Explore the protocol
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}
