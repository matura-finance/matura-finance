import { buttonVariants } from "@matura/ui/components/button";
import { Container } from "@matura/ui/components/container";
import { Stack } from "@matura/ui/components/stack";
import type { Metadata } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.matura.xyz";

export const metadata: Metadata = {
  title: "How it works — Matura",
  description: "How Matura turns a verified entitlement into usable liquidity, step by step.",
};

const STEPS = [
  {
    step: "Verify",
    body: "You connect the entitlement — an invoice, a vested position, a pending payout. Matura checks that it is genuine, attributable to you, and not already pledged.",
  },
  {
    step: "Compare",
    body: "Verified claims are shown to funding counterparties, who price them against the time left until settlement. You review the offers before anything is committed.",
  },
  {
    step: "Split",
    body: "You choose how much of the claim to advance now. The remainder stays yours and settles on its original schedule.",
  },
  {
    step: "Route",
    body: "The accepted portion is matched to the counterparty offering the best terms and recorded against the claim.",
  },
  {
    step: "Receive",
    body: "Funds become available to you as soon as the match is confirmed.",
  },
  {
    step: "Settle",
    body: "When the entitlement matures, the proceeds repay the counterparty first. Anything left over returns to you.",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <Container>
      <Stack gap="xl" className="max-w-3xl py-24">
        <Stack gap="md">
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-mist">
            Get paid for tomorrow&apos;s money, today.
          </h1>
          <p className="text-lg text-mist/70">
            Matura sits between an entitlement you have already earned and the day it pays out. This
            walkthrough follows a single claim from verification to settlement. It describes the
            prototype flow and is not financial advice.
          </p>
        </Stack>

        <Stack gap="lg">
          {STEPS.map((item, index) => (
            <div key={item.step} className="flex gap-5">
              <span className="font-heading text-lg text-liquid-mint">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 className="font-heading text-xl font-semibold text-mist">{item.step}</h2>
                <p className="mt-1 text-mist/70">{item.body}</p>
              </div>
            </div>
          ))}
        </Stack>

        <a href={APP_URL} className={buttonVariants({ size: "lg" })} rel="noreferrer">
          Try it in the app
        </a>
      </Stack>
    </Container>
  );
}
