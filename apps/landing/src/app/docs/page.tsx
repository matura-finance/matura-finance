import { Container } from "@matura/ui/components/container";
import { Stack } from "@matura/ui/components/stack";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Docs — Matura",
  description: "Documentation for the Matura protocol and app. A work in progress.",
};

const SECTIONS = [
  {
    title: "Concepts",
    body: "What an entitlement is, how verification works, and what settlement guarantees.",
    href: "/how-it-works",
    cta: "Read the walkthrough",
  },
  {
    title: "Protocol",
    body: "The principles the protocol holds to and how the three parties around a claim interact.",
    href: "/protocol",
    cta: "See the principles",
  },
  {
    title: "For issuers",
    body: "How obligations are verified and why an advance never changes your payment schedule.",
    href: "/for-issuers",
    cta: "Read the issuer guide",
  },
] as const;

export default function DocsPage() {
  return (
    <Container>
      <Stack gap="xl" className="max-w-3xl py-24">
        <Stack gap="md">
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-mist">
            Documentation
          </h1>
          <p className="text-lg text-mist/70">
            These docs grow alongside the prototype. Some details will change as the protocol
            settles. Start with the pages below; deeper technical references are on the way.
          </p>
        </Stack>

        <Stack gap="lg">
          {SECTIONS.map((section) => (
            <Link
              key={section.title}
              href={section.href}
              className="group rounded-card border border-white/10 bg-white/[0.02] p-6 transition-colors hover:border-liquid-mint/40"
            >
              <h2 className="font-heading text-xl font-semibold text-mist">{section.title}</h2>
              <p className="mt-2 text-mist/70">{section.body}</p>
              <p className="mt-3 text-sm text-liquid-mint">{section.cta} →</p>
            </Link>
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
