import { Badge } from "@matura/ui/components/badge";
import { Container } from "@matura/ui/components/container";
import { Stack } from "@matura/ui/components/stack";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Protocol — Matura",
  description:
    "The design principles behind the Matura protocol: verified claims, honest pricing, and self-settling repayment.",
};

const PRINCIPLES = [
  {
    title: "Nothing advances unverified",
    body: "Every claim is checked for authenticity and ownership before it can be funded. A claim that cannot be verified cannot enter the market.",
  },
  {
    title: "Repayment settles itself",
    body: "The maturing entitlement repays its counterparty directly, so an advance is not a loan you have to remember to pay back.",
  },
  {
    title: "Pricing is transparent",
    body: "Offers are quoted against time to settlement and shown to you in full. You accept terms you can see, not terms you infer.",
  },
  {
    title: "You keep what you don't sell",
    body: "Splitting a claim advances only the portion you choose. The remainder stays on its original schedule and remains yours.",
  },
] as const;

export default function ProtocolPage() {
  return (
    <Container>
      <Stack gap="xl" className="max-w-3xl py-24">
        <Stack gap="md">
          <Badge variant="outline" className="w-fit border-liquid-mint/40 text-liquid-mint">
            Prototype
          </Badge>
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-mist">
            A settlement layer for earned value.
          </h1>
          <p className="text-lg text-mist/70">
            The protocol coordinates three parties around a single claim: the person who earned it,
            the counterparty who funds it early, and the settlement that repays them in order. These
            are the principles it holds to. The implementation is an early prototype and is still
            changing.
          </p>
        </Stack>

        <Stack gap="lg">
          {PRINCIPLES.map((item) => (
            <div
              key={item.title}
              className="rounded-card border border-white/10 bg-white/[0.02] p-6"
            >
              <h2 className="font-heading text-xl font-semibold text-mist">{item.title}</h2>
              <p className="mt-2 text-mist/70">{item.body}</p>
            </div>
          ))}
        </Stack>
      </Stack>
    </Container>
  );
}
