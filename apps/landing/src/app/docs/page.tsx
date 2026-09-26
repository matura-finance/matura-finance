import { Card } from "@matura/ui/components/card";
import type { Metadata } from "next";

import { DisplayHeading, Eyebrow, Lede, Section } from "../../components/marketing";
import { APP_URL, GITHUB_DOCS, GITHUB_URL } from "../../lib/site";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Getting started with Matura plus links to the public protocol documentation: README, architecture, routing, and threat model.",
  alternates: { canonical: "/docs" },
};

const GETTING_STARTED = [
  {
    title: "1 · Open the app",
    body: "Connect an injected wallet on BNB Chain Testnet. Matura is non-custodial—it never holds your key, and every write is signed by you.",
  },
  {
    title: "2 · Review your account",
    body: "Verified future payments appear in one account with their amount, maturity, and how much is available to route.",
  },
  {
    title: "3 · Request an amount",
    body: "Enter what you need. Matura compares eligible vaults and shows the exact slices, vaults, and cost of the best executable route before you sign.",
  },
  {
    title: "4 · Sign and receive",
    body: "You authorize the route with a signature (gasless) and submit one onchain transaction. Liquidity is confirmed only after settlement is indexed.",
  },
] as const;

const REFERENCES = [
  {
    label: "README",
    href: GITHUB_DOCS.readme,
    body: "Project overview, setup, and the local dev loop.",
  },
  {
    label: "Architecture",
    href: GITHUB_DOCS.architecture,
    body: "How the monorepo, contracts, indexer, and API fit together.",
  },
  {
    label: "Routing",
    href: GITHUB_DOCS.routing,
    body: "The Best-Execution Claim Router: two-phase optimize/prepare, the leg mirror, and cost floor.",
  },
  {
    label: "Threat model",
    href: GITHUB_DOCS.threatModel,
    body: "Security posture, trust boundaries, and non-custodial invariants.",
  },
] as const;

export default function DocsPage() {
  return (
    <>
      <Section tone="mist">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-gutter">
          <Eyebrow>Documentation</Eyebrow>
          <DisplayHeading as="h1" className="text-midnight">
            Getting started with Matura.
          </DisplayHeading>
          <Lede className="text-xl">
            A short walkthrough of the flow, plus links to the full protocol documentation in the
            public repository.
          </Lede>
        </div>
      </Section>

      <Section tone="card" className="border-y border-midnight/10">
        <div className="mx-auto w-full max-w-6xl px-gutter">
          <h2 className="font-heading text-2xl font-semibold text-midnight">Quick start</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {GETTING_STARTED.map((item) => (
              <Card key={item.title} className="h-full gap-3 p-6">
                <h3 className="font-heading text-lg font-semibold text-midnight">{item.title}</h3>
                <p className="text-sm leading-relaxed text-midnight/70">{item.body}</p>
              </Card>
            ))}
          </div>
          <a
            href={APP_URL}
            className="mt-8 inline-flex text-sm font-semibold text-midnight underline decoration-liquid-mint decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Open Matura to try it →
          </a>
        </div>
      </Section>

      <Section tone="mist">
        <div className="mx-auto w-full max-w-6xl px-gutter">
          <h2 className="font-heading text-2xl font-semibold text-midnight">
            Protocol documentation
          </h2>
          <p className="mt-3 max-w-[60ch] text-midnight/70">
            The technical references live in the public GitHub repository and stay in sync with the
            code.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {REFERENCES.map((ref) => (
              <a
                key={ref.label}
                href={ref.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Card className="h-full gap-2 p-6 transition-colors group-hover:border-midnight/30">
                  <h3 className="font-heading text-lg font-semibold text-midnight">{ref.label}</h3>
                  <p className="text-sm leading-relaxed text-midnight/70">{ref.body}</p>
                </Card>
              </a>
            ))}
          </div>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex text-sm font-semibold text-midnight underline decoration-liquid-mint decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            View the repository on GitHub →
          </a>
        </div>
      </Section>
    </>
  );
}
