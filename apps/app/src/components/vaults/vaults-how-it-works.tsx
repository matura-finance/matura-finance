"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@matura/ui/components/button";

import { Dialog } from "../ui/dialog";
import { Tooltip } from "../ui/tooltip";

const STEPS = [
  {
    title: "A future payment is verified",
    body: "An approved issuer attests your receivable on-chain as a Matura Claim — recording who is owed, how much, and when it matures.",
  },
  {
    title: "Vaults compete to fund it",
    body: "Each liquidity vault sets a mandate (which claim types it funds, lot size, max duration) and a price — a base discount plus a small per-day rate. Matura's router compares every eligible vault and picks the cheapest route.",
  },
  {
    title: "You receive liquidity today",
    body: "You sign the route and the winning vault sends an upfront advance in USDT now. The financed slice of the claim's face value is assigned to that vault.",
  },
  {
    title: "The vault is repaid at maturity",
    body: "When the claim settles, the vault recovers the face value it financed — the discount it charged is its yield. You keep any unfinanced remainder.",
  },
] as const;

const FLOW = [
  { label: "You — the beneficiary", icon: <PersonIcon /> },
  { label: "Your verified Matura Claim", icon: <DocIcon /> },
  { label: "A liquidity vault funds it", icon: <VaultIcon /> },
  { label: "Upfront advance in USDT", icon: <CoinsIcon /> },
] as const;

/**
 * "?" beside the Vaults heading: a "How It Works" tooltip on hover/focus, and on click an explainer
 * dialog (left: the claim → vault → advance flow; right: the four numbered steps + a testnet note).
 */
export function VaultsHowItWorks() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  return (
    <>
      <Tooltip label="How It Works" interactive>
        <button
          type="button"
          aria-label="How Matura Vaults work"
          onClick={() => {
            setActive(0);
            setOpen(true);
          }}
          className="flex size-6 items-center justify-center rounded-full border border-border text-sm font-semibold text-muted-foreground transition-colors hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ?
        </button>
      </Tooltip>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        size="2xl"
        label="How Matura Vaults work"
      >
        <div className="relative py-8 md:py-14">
          <button
            type="button"
            aria-label="Close"
            onClick={() => {
              setOpen(false);
            }}
            className="absolute -right-2 -top-2 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="flex flex-col gap-10 md:flex-row md:gap-14">
            {/* Left: the claim → vault → advance flow. The node for the active step is highlighted. */}
            <div className="hidden md:flex md:w-2/5 md:items-center md:justify-center">
              <div className="relative flex flex-col gap-8">
                <span
                  aria-hidden
                  className="absolute bottom-7 left-[27px] top-7 w-px border-l border-dashed border-border"
                />
                {FLOW.map((node, i) => {
                  const on = i === active;
                  return (
                    <div
                      key={node.label}
                      className={`relative flex items-center gap-4 transition-opacity duration-300 ${
                        on ? "opacity-100" : "opacity-30"
                      }`}
                    >
                      <span
                        className={`flex size-14 shrink-0 items-center justify-center rounded-full shadow-sm transition-transform duration-300 ${
                          on
                            ? "scale-110 bg-gradient-to-br from-primary to-primary/60 text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {node.icon}
                      </span>
                      <span className="text-sm font-medium text-foreground">{node.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: the steps as an interactive stepper — click a step to focus it. */}
            <div className="flex-1">
              <h2 className="font-heading text-2xl font-semibold text-foreground">
                How Matura Vaults Work
              </h2>
              <ol className="mt-6 flex flex-col gap-5">
                {STEPS.map((step, i) => {
                  const on = i === active;
                  return (
                    <li key={step.title}>
                      <button
                        type="button"
                        aria-current={on ? "step" : undefined}
                        onClick={() => {
                          setActive(i);
                        }}
                        className={`flex w-full gap-4 text-left transition-opacity duration-200 ${
                          on ? "opacity-100" : "opacity-40 hover:opacity-70"
                        }`}
                      >
                        <span
                          className={`font-mono text-sm font-semibold tabular-nums ${
                            on ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <p className="font-medium text-foreground">{step.title}</p>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {step.body}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ol>

              <div className="my-6 h-px bg-border" />

              <p className="text-sm leading-relaxed text-muted-foreground">
                Testnet prototype — vaults hold mock USDT and nothing here is a real financial
                product or offer. Assess a vault&apos;s mandate and pricing before routing to it.
              </p>

              <div className="mt-6 flex justify-end">
                <Button
                  className="capitalize"
                  onClick={() => {
                    setOpen(false);
                  }}
                >
                  Got it
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function IconWrap({ children }: { children: ReactNode }) {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function PersonIcon() {
  return (
    <IconWrap>
      <circle cx={12} cy={8} r={4} />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </IconWrap>
  );
}

function DocIcon() {
  return (
    <IconWrap>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </IconWrap>
  );
}

function VaultIcon() {
  return (
    <IconWrap>
      <path d="M12 2 3 6v6c0 5 3.8 8.5 9 10 5.2-1.5 9-5 9-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </IconWrap>
  );
}

function CoinsIcon() {
  return (
    <IconWrap>
      <circle cx={8} cy={8} r={6} />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82" />
    </IconWrap>
  );
}
