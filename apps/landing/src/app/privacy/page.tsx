import { Container } from "@matura/ui/components/container";
import { Stack } from "@matura/ui/components/stack";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy — Matura",
  description: "How Matura handles information during the prototype phase.",
};

const SECTIONS = [
  {
    title: "What this covers",
    body: "Matura is an early prototype. This page explains, in plain terms, how we handle information while the product is still being built. It is not a final legal policy, and it will be replaced before any general release.",
  },
  {
    title: "What we collect",
    body: "We collect only what a request needs to function — the details of a claim you choose to verify and basic usage data that helps us find and fix problems. We do not ask for more than the flow in front of you requires.",
  },
  {
    title: "What we don't do",
    body: "We do not sell your information, and we do not use it for advertising. The landing site itself does not connect a wallet or read on-chain balances.",
  },
  {
    title: "Your choices",
    body: "You decide which entitlements to bring to Matura and how much of each to advance. You can ask us what we hold about you, and ask us to remove it, at any time.",
  },
  {
    title: "Contact",
    body: "Questions about privacy can go to privacy@matura.xyz. Because this is a prototype, please avoid sharing anything you would not be comfortable sharing during active development.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <Container>
      <Stack gap="xl" className="max-w-3xl py-24">
        <Stack gap="md">
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-mist">Privacy</h1>
          <p className="text-lg text-mist/70">
            Straightforward answers about what we collect and why, written for the prototype phase.
          </p>
        </Stack>

        <Stack gap="lg">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 className="font-heading text-xl font-semibold text-mist">{section.title}</h2>
              <p className="mt-2 text-mist/70">{section.body}</p>
            </div>
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
