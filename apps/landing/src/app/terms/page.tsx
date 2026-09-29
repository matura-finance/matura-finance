import { Badge } from "@matura/ui/components/badge";
import type { Metadata } from "next";

import { DisplayHeading, Eyebrow, Lede, Section } from "../../components/marketing";
import { CONTACT_EMAIL } from "../../lib/site";

export const metadata: Metadata = {
  title: "Matura",
  description: "Terms for using the Matura testnet prototype. Draft.",
  alternates: { canonical: "/terms" },
};

const SECTIONS = [
  {
    heading: "Prototype status",
    body: "Matura is a BNB Chain testnet prototype provided for evaluation. It uses synthetic claims and mock assets, is offered as-is without warranties, and may change or be withdrawn at any time.",
  },
  {
    heading: "Not financial advice or a financial service",
    body: "Matura does not provide a production financial service or legal, investment, or lending advice. Nothing on this site or in the app is an offer, solicitation, or recommendation.",
  },
  {
    heading: "No real value",
    body: "The testnet uses mock assets with no monetary value. Do not use real funds, and do not rely on the prototype for any production obligation.",
  },
  {
    heading: "Your responsibilities",
    body: "You are responsible for the security of your wallet and keys and for any transactions you sign. Matura is non-custodial and cannot reverse an onchain transaction.",
  },
  {
    heading: "Availability",
    body: "The prototype may be unavailable, reset, or reconfigured without notice as development continues. Data may be wiped between iterations.",
  },
] as const;

export default function TermsPage() {
  return (
    <Section tone="mist">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-gutter">
        <Eyebrow>Terms</Eyebrow>
        <DisplayHeading as="h1" className="text-midnight">
          Terms of use
        </DisplayHeading>
        <Badge variant="warning" className="w-fit">
          Draft — pending legal review
        </Badge>
        <Lede>
          Plain-language terms for the testnet prototype. These are not counsel-approved and will be
          replaced before any general release.
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
              Questions about these terms can go to{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-medium text-midnight underline decoration-liquid-mint decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
