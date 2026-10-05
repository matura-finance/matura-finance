import { Badge } from "@matura/ui/components/badge";
import type { Metadata } from "next";

import { DisplayHeading, Eyebrow, Lede, Section } from "../../components/marketing";
import { CONTACT_EMAIL } from "../../lib/site";

export const metadata: Metadata = {
  title: "Matura",
  description: "How Matura handles information during the testnet prototype phase. Draft.",
  alternates: { canonical: "/privacy" },
};

const SECTIONS = [
  {
    heading: "Scope",
    body: "Matura is a BNB Chain testnet prototype. This notice explains, in plain terms, how information is handled while the product is being built. It is not a finished legal policy and will be replaced before any general release.",
  },
  {
    heading: "What the site does",
    body: "This marketing site is static and wallet-free. It does not connect a wallet, read onchain balances, set advertising cookies, or collect personal information to browse.",
  },
  {
    heading: "What the app processes",
    body: "The product app processes only what a request needs to function—your wallet address for authentication and the details of claims you choose to route. All transactions are user-signed; Matura never holds your private key.",
  },
  {
    heading: "Onchain data is public",
    body: "Actions you take on BNB Chain are recorded on a public ledger and are outside Matura's control. Do not submit anything you would not want publicly visible.",
  },
  {
    heading: "What we do not do",
    body: "We do not sell personal information and do not use it for advertising.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <Section tone="mist" reveal={false}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-gutter">
        <Eyebrow>Privacy</Eyebrow>
        <div className="flex flex-wrap items-center gap-3">
          <DisplayHeading as="h1" className="text-midnight">
            Privacy notice
          </DisplayHeading>
        </div>
        <Badge variant="warning" className="w-fit">
          Draft — pending legal review
        </Badge>
        <Lede>
          Straightforward answers about what is collected and why, written for the prototype phase.
          Nothing here is counsel-approved.
        </Lede>

        <div className="mt-4 flex flex-col gap-8">
          {SECTIONS.map((section) => (
            <div key={section.heading} className="flex flex-col gap-2">
              <h2 className="font-heading text-lg font-semibold text-midnight">
                {section.heading}
              </h2>
              <p className="leading-relaxed text-midnight/70">{section.body}</p>
            </div>
          ))}
          <div className="flex flex-col gap-2">
            <h2 className="font-heading text-lg font-semibold text-midnight">Contact</h2>
            <p className="leading-relaxed text-midnight/70">
              Questions about privacy can go to{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-medium text-midnight underline decoration-liquid-mint decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {CONTACT_EMAIL}
              </a>
              . Because this is a prototype, please avoid sharing anything you would not be
              comfortable sharing during active development.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
