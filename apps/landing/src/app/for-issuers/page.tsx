import { buttonVariants } from "@matura/ui/components/button";
import { Container } from "@matura/ui/components/container";
import { Stack } from "@matura/ui/components/stack";
import type { Metadata } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.matura.xyz";

export const metadata: Metadata = {
  title: "For issuers — Matura",
  description:
    "Let the people you already owe reach their earned value early, without changing when you pay.",
};

const POINTS = [
  {
    title: "Your schedule stays yours",
    body: "Advances are funded by counterparties, not by you. You pay the same amount, at the same maturity, to whoever holds the claim at settlement.",
  },
  {
    title: "Only real obligations qualify",
    body: "Matura verifies each claim against what you have actually issued, so nothing you have not committed to can be advanced.",
  },
  {
    title: "Give recipients optionality",
    body: "The people you owe decide whether to wait or to take value early. You give them a choice without taking on new liability.",
  },
] as const;

export default function ForIssuersPage() {
  return (
    <Container>
      <Stack gap="xl" className="max-w-3xl py-24">
        <Stack gap="md">
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-mist">
            Turn what you owe into an offer, not a burden.
          </h1>
          <p className="text-lg text-mist/70">
            If you issue entitlements — payouts, invoices, vesting — Matura lets the people holding
            them reach that value early, while your obligations settle exactly as they always would.
            This is a prototype; talk to us before relying on it for production obligations.
          </p>
        </Stack>

        <Stack gap="lg">
          {POINTS.map((item) => (
            <div
              key={item.title}
              className="rounded-card border border-white/10 bg-white/[0.02] p-6"
            >
              <h2 className="font-heading text-xl font-semibold text-mist">{item.title}</h2>
              <p className="mt-2 text-mist/70">{item.body}</p>
            </div>
          ))}
        </Stack>

        <Stack direction="horizontal" gap="md" className="flex-wrap">
          <a href={APP_URL} className={buttonVariants({ size: "lg" })} rel="noreferrer">
            Explore the app
          </a>
          <a
            href="mailto:hello@matura.xyz"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Talk to us
          </a>
        </Stack>
      </Stack>
    </Container>
  );
}
