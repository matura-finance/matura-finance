import { Badge } from "@matura/ui/components/badge";
import { buttonVariants } from "@matura/ui/components/button";
import { Card } from "@matura/ui/components/card";
import { cn } from "@matura/ui/lib/utils";
import type { Metadata } from "next";

import { DisplayHeading, Eyebrow, Lede, Section } from "../../components/marketing";
import { BSCSCAN_TESTNET_URL, CONTRACTS_DEPLOYED } from "../../lib/site";

export const metadata: Metadata = {
  title: "Protocol",
  description:
    "The Matura Protocol architecture: issuer-authorized claims, isolated vaults, the Best-Execution Claim Router, trust boundaries, and testnet deployment status.",
  alternates: { canonical: "/protocol" },
};

const ROLES = [
  {
    name: "Matura Claims",
    body: "Issuer-authorized records of a future payment. An approved issuer signs an attestation binding the amount, beneficiary, and maturity; the registry tracks each claim's state through settlement.",
  },
  {
    name: "Matura Vaults",
    body: "Isolated liquidity pools with their own mandate—supported claim types, maximum duration, and risk limits. Each vault quotes executable prices and funds only the slices it selects.",
  },
  {
    name: "Best-Execution Claim Router",
    body: "A deterministic optimizer that collects vault quotes, validates each leg onchain against a pinned block, and selects the lowest-cost eligible combination before authorizing atomic funding.",
  },
  {
    name: "Settlement",
    body: "At maturity the issuer pays the protocol. Settlement is conservation-checked—funded vaults are repaid and the retained balance returns to the beneficiary—so value is never created or lost.",
  },
] as const;

const BOUNDARIES = [
  {
    heading: "Issuers are the source of truth offchain",
    body: "Payment rights originate with issuers. The chain never holds private documents—only claim state, vault accounting, route authorization, and settlement.",
  },
  {
    heading: "Every write is user-signed",
    body: "The protocol is non-custodial. It never holds a user key; each funding route is authorized by the beneficiary's own signature and self-submitted.",
  },
  {
    heading: "Quotes are validated onchain",
    body: "The router re-validates each leg against a pinned block before execution, so a route reflects prices that were actually executable—not a stale or optimistic estimate.",
  },
] as const;

export default function ProtocolPage() {
  return (
    <>
      <Section tone="mist">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-gutter">
          <Eyebrow>Matura Protocol</Eyebrow>
          <DisplayHeading as="h1" className="text-midnight">
            Verifiable execution from claim to settlement.
          </DisplayHeading>
          <Lede className="text-xl">
            The protocol coordinates issuer-authorized claims, isolated vaults, deterministic
            routing, and conservation-checked settlement on BNB Chain. This is a testnet prototype.
          </Lede>
        </div>
      </Section>

      <Section tone="card" className="border-y border-midnight/10">
        <div className="mx-auto w-full max-w-6xl px-gutter">
          <h2 className="font-heading text-2xl font-semibold text-midnight">Contract roles</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {ROLES.map((role) => (
              <Card key={role.name} className="h-full gap-3 p-6">
                <span aria-hidden className="h-1.5 w-6 rounded-full bg-liquid-mint" />
                <h3 className="font-heading text-lg font-semibold text-midnight">{role.name}</h3>
                <p className="text-sm leading-relaxed text-midnight/70">{role.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      <Section tone="mist">
        <div className="mx-auto w-full max-w-6xl px-gutter">
          <h2 className="font-heading text-2xl font-semibold text-midnight">Trust boundaries</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {BOUNDARIES.map((item) => (
              <div key={item.heading} className="flex flex-col gap-2">
                <h3 className="font-heading text-lg font-semibold text-midnight">{item.heading}</h3>
                <p className="text-sm leading-relaxed text-midnight/70">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Deployment status + explicit mocks (Deep Night) */}
      <Section tone="deep-night">
        <div className="mx-auto w-full max-w-3xl px-gutter">
          <Eyebrow tone="dark">Deployment</Eyebrow>
          <DisplayHeading className="mt-5 text-mist">Testnet addresses</DisplayHeading>
          <Lede tone="dark" className="mt-5 text-mist/70">
            Matura currently runs on BNB Chain Testnet with synthetic claims and mock assets—the
            settlement token is a mock USDT, and claims are demo issuances, not production
            obligations.
          </Lede>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Badge variant="warning">Synthetic claims · mock assets</Badge>
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
                View contracts on BscScan
              </a>
            ) : (
              <span className="text-sm font-medium text-liquid-mint">Contracts deploying soon</span>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
