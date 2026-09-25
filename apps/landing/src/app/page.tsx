import { Badge } from "@matura/ui/components/badge";
import { buttonVariants } from "@matura/ui/components/button";
import { Container } from "@matura/ui/components/container";
import { Stack } from "@matura/ui/components/stack";
import Link from "next/link";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.matura.xyz";

const FLOW = [
  {
    step: "Verify",
    detail: "Confirm the entitlement is real, yours, and not already committed elsewhere.",
  },
  {
    step: "Compare",
    detail: "See competing offers side by side, priced against time to settlement.",
  },
  {
    step: "Split",
    detail: "Take liquidity on part of the claim and keep the rest for later.",
  },
  {
    step: "Route",
    detail: "The claim is matched to the counterparty with the best terms.",
  },
  {
    step: "Receive",
    detail: "Usable funds land in your account on acceptance.",
  },
  {
    step: "Settle",
    detail: "When the entitlement matures, the counterparty is repaid automatically.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <section className="border-b border-white/10">
        <Container>
          <Stack gap="lg" className="max-w-3xl py-24">
            <Badge variant="outline" className="w-fit border-liquid-mint/40 text-liquid-mint">
              Prototype
            </Badge>
            <h1 className="font-heading text-4xl font-semibold tracking-tight text-mist sm:text-6xl">
              Liquidity for what you&apos;ve already earned.
            </h1>
            <p className="text-lg text-mist/70">
              You have earned it, but it has not paid out yet. Matura turns verified, already-earned
              entitlements into funds you can use today — without giving up what settles tomorrow.
            </p>
            <Stack direction="horizontal" gap="md" className="flex-wrap">
              <a href={APP_URL} className={buttonVariants({ size: "lg" })} rel="noreferrer">
                Open the app
              </a>
              <Link
                href="/how-it-works"
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                See how it works
              </Link>
            </Stack>
          </Stack>
        </Container>
      </section>

      <section>
        <Container>
          <Stack gap="xl" className="py-section">
            <Stack gap="sm" className="max-w-2xl">
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-mist">
                Six steps from claim to cash.
              </h2>
              <p className="text-mist/70">
                Every advance follows the same path. Nothing moves until the entitlement is
                verified, and repayment is settled by the claim itself.
              </p>
            </Stack>

            <p className="font-heading text-sm uppercase tracking-widest text-liquid-mint">
              Verify → Compare → Split → Route → Receive → Settle
            </p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FLOW.map((item, index) => (
                <div
                  key={item.step}
                  className="rounded-card border border-white/10 bg-white/[0.02] p-6"
                >
                  <p className="font-heading text-sm text-liquid-mint">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-2 font-heading text-lg font-semibold text-mist">{item.step}</h3>
                  <p className="mt-2 text-sm text-mist/70">{item.detail}</p>
                </div>
              ))}
            </div>
          </Stack>
        </Container>
      </section>
    </>
  );
}
