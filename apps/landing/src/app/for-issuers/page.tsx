import { buttonVariants } from "@matura/ui/components/button";
import { Card } from "@matura/ui/components/card";
import { cn } from "@matura/ui/lib/utils";
import type { Metadata } from "next";

import { DisplayHeading, Eyebrow, Lede, Section } from "../../components/marketing";
import { CONTACT_EMAIL } from "../../lib/site";

export const metadata: Metadata = {
  title: "For issuers",
  description:
    "Payroll providers, freelance platforms, marketplaces, and creator tools can offer faster access to approved payouts through Matura—without building a financing stack.",
  alternates: { canonical: "/for-issuers" },
};

const VALUE = [
  {
    title: "Faster access, same schedule",
    body: "The people you owe can reach approved value early while your obligations settle exactly when they always would. Liquidity comes from vaults, not from you.",
  },
  {
    title: "One integration, every payout type",
    body: "Payroll, freelance payouts, marketplace settlements, and streams flow through the same claim primitive—no separate financing stack per product.",
  },
  {
    title: "Transparent by construction",
    body: "Every funded slice is traceable onchain: claim state, selected vaults, cost, and settlement status, without exposing private documents.",
  },
] as const;

const INTEGRATION = [
  {
    step: "Attest",
    body: "Sign a claim attestation binding the amount, beneficiary, and expected payment date. Your signing key stays with you; Matura never holds it.",
  },
  {
    step: "Configure eligibility",
    body: "Set which payout types and durations qualify. Only obligations you have committed to can ever be routed.",
  },
  {
    step: "Reconcile automatically",
    body: "As claims are funded and settled, state updates onchain—so reconciliation and settlement reporting stay in sync without manual bookkeeping.",
  },
  {
    step: "Retain settlement control",
    body: "At maturity you pay Matura Protocol once. The protocol repays the funded vaults and returns any retained balance to the beneficiary.",
  },
] as const;

const ATTESTATIONS = [
  "Amount and settlement currency",
  "Beneficiary address",
  "Expected payment (maturity) date",
  "Claim type and issuer identity",
] as const;

export default function ForIssuersPage() {
  return (
    <>
      <Section tone="mist">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-gutter">
          <Eyebrow>For platforms and issuers</Eyebrow>
          <DisplayHeading as="h1" className="text-midnight">
            Make approved payouts useful before payday.
          </DisplayHeading>
          <Lede className="text-xl">
            Offer faster access to money you have already approved—without building a separate
            financing stack for every payout type.
          </Lede>
          <div className="pt-1">
            <a href={`mailto:${CONTACT_EMAIL}`} className={cn(buttonVariants({ size: "lg" }))}>
              Talk to the team
            </a>
          </div>
        </div>
      </Section>

      <Section tone="card" className="border-y border-midnight/10">
        <div className="mx-auto w-full max-w-6xl px-gutter">
          <div className="grid gap-5 md:grid-cols-3">
            {VALUE.map((item) => (
              <Card key={item.title} className="h-full gap-3 p-6">
                <span aria-hidden className="h-1.5 w-6 rounded-full bg-liquid-mint" />
                <h2 className="font-heading text-lg font-semibold text-midnight">{item.title}</h2>
                <p className="text-sm leading-relaxed text-midnight/70">{item.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      <Section tone="mist">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-gutter lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="font-heading text-2xl font-semibold text-midnight">Integration flow</h2>
            <ol className="mt-6 flex flex-col gap-6">
              {INTEGRATION.map((item, index) => (
                <li key={item.step} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-liquid-mint font-heading text-sm font-bold text-midnight">
                    {index + 1}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-heading text-base font-semibold text-midnight">
                      {item.step}
                    </h3>
                    <p className="text-sm leading-relaxed text-midnight/70">{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <Card className="gap-4 p-6">
            <h2 className="font-heading text-lg font-semibold text-midnight">
              Required issuer attestations
            </h2>
            <p className="text-sm text-midnight/60">
              Each claim is signed by an approved issuer. The attestation binds:
            </p>
            <ul className="flex flex-col gap-2">
              {ATTESTATIONS.map((field) => (
                <li key={field} className="flex items-center gap-3 text-sm text-midnight">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-liquid-mint" />
                  {field}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Section>

      <Section tone="deep-night">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-6 px-gutter">
          <DisplayHeading className="text-mist">Build with us.</DisplayHeading>
          <Lede tone="dark" className="text-mist/70">
            Tell us about the payouts you issue and we&apos;ll help you scope an integration on the
            testnet prototype.
          </Lede>
          <a href={`mailto:${CONTACT_EMAIL}`} className={cn(buttonVariants({ size: "lg" }))}>
            Talk to the team
          </a>
        </div>
      </Section>
    </>
  );
}
