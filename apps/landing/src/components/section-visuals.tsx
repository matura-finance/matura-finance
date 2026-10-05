/**
 * Presentational helpers for the landing sections — issuer mini-illustrations,
 * accordion/checklist icons, decorative backdrops, and the live-diagnostics
 * panel. Server components, all wallet-free.
 */

import { cn } from "@matura/ui/lib/utils";

import type { IssuerKind } from "../lib/landing-content";
import {
  bscScanAddress,
  CHAIN_ID,
  DEPLOYMENT_BLOCK,
  TESTNET_CONTRACTS,
  TESTNET_VAULTS,
} from "../lib/site";
import { MonoTag, Panel } from "./marketing";

/**
 * Built mini-illustrations for the issuer feature cards — a signed claim, an
 * eligibility-rules panel, and a settlement chart. White cards on the brand
 * gradient; purely presentational, so `aria-hidden`.
 */
export function IssuerVisual({ kind }: { kind: IssuerKind }) {
  if (kind === "sign") {
    return (
      <div
        aria-hidden
        className="w-full max-w-[16rem] rounded-xl bg-background p-4 shadow-xl shadow-black/20"
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-midnight/50">
            Payroll · May
          </span>
          <span className="inline-flex items-center gap-1 rounded-pill bg-liquid-mint/20 px-2 py-0.5 text-[11px] font-semibold text-midnight">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Signed
          </span>
        </div>
        <div className="mt-3 font-heading text-2xl font-bold tabular-nums text-midnight">
          $3,200.00
        </div>
        <div className="mt-1 text-xs text-midnight/45">Payee 0x9f…7bE · due Jun 1</div>
      </div>
    );
  }

  if (kind === "rules") {
    const rules = [
      { label: "Max advance", value: "80%", on: true },
      { label: "KYC verified", value: "", on: true },
      { label: "Vault allowlist", value: "", on: false },
    ];
    return (
      <div
        aria-hidden
        className="flex w-full max-w-[16rem] flex-col gap-3.5 rounded-xl bg-background p-4 shadow-xl shadow-black/20"
      >
        {rules.map((rule) => (
          <div key={rule.label} className="flex items-center justify-between gap-3">
            <span className="text-sm text-midnight/70">{rule.label}</span>
            <span className="flex items-center gap-2">
              {rule.value ? (
                <span className="font-mono text-xs text-midnight/45">{rule.value}</span>
              ) : null}
              <span
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  rule.on ? "bg-liquid-mint" : "bg-midnight/15",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow",
                    rule.on ? "left-[18px]" : "left-0.5",
                  )}
                />
              </span>
            </span>
          </div>
        ))}
      </div>
    );
  }

  const bars = [40, 55, 35, 70, 52, 100, 62, 44, 80, 38];
  return (
    <div
      aria-hidden
      className="w-full max-w-[16rem] rounded-xl bg-background p-4 shadow-xl shadow-black/20"
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-midnight/50">
        Settled · May
      </span>
      <div className="mt-1 font-heading text-2xl font-bold tabular-nums text-midnight">$48,200</div>
      <div className="mt-3 flex h-20 items-end gap-1.5">
        {bars.map((height, index) => (
          <span
            key={`bar-${String(index)}`}
            className={cn("flex-1 rounded-t-sm", index === 5 ? "bg-liquid-mint" : "bg-midnight/15")}
            style={{ height: `${String(height)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Chevron for the router accordion summaries. Points down when closed and flips
 * up when its parent <details class="group"> is open.
 */
export function ChevronIcon() {
  return (
    <svg
      aria-hidden
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-midnight/40 transition-transform duration-200 group-open:rotate-180"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Checklist tick for the Why-Matura grid. Liquid Mint is contrast-legal here
 * because it's a tick/fill, never copy. Nudged down to sit on the title line.
 */
export function CheckIcon() {
  return (
    <svg
      aria-hidden
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-liquid-mint"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * Decorative pixel-grid mosaic that fades in from a card's top-right corner —
 * the subtle texture on the problem cards. Brand ink (Midnight) at very low
 * opacity, radially masked so it dissolves toward the card body. Presentational,
 * so `aria-hidden`.
 */
export function FeatureMosaic() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-0 top-0 h-28 w-28"
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(17,24,39,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(17,24,39,0.07) 1px, transparent 1px)",
        backgroundSize: "14px 14px",
        maskImage: "radial-gradient(circle at top right, black, transparent 72%)",
        WebkitMaskImage: "radial-gradient(circle at top right, black, transparent 72%)",
      }}
    >
      <span className="absolute right-5 top-4 h-3 w-3 bg-midnight/[0.06]" />
      <span className="absolute right-12 top-8 h-2.5 w-2.5 bg-midnight/[0.05]" />
      <span className="absolute right-6 top-12 h-2 w-2 bg-midnight/[0.04]" />
    </span>
  );
}

/**
 * Decorative hero backdrop — soft, blurred brand-color washes behind the centered
 * hero. Brand palette only (Liquid Mint + the vault ramp), kept low-opacity so ink
 * copy stays AA on Mist. Purely presentational, so `aria-hidden` and non-interactive.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-[var(--color-vault-1)]/10 blur-3xl" />
      <div className="absolute -right-16 top-10 h-[24rem] w-[24rem] rounded-full bg-liquid-mint/15 blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-mist" />
    </div>
  );
}

/**
 * Live-deployment readout: real BSC-Testnet contract addresses (mirrored from the
 * committed manifest) with BscScan proof links, styled as an instrument panel.
 * Fully static — no runtime fetch. Live vault liquidity can be layered on later
 * via the public `GET /api/v1/vaults` read endpoint (see docs plan). On Mist,
 * Liquid Mint appears only as fills/ticks (contrast law), never as copy.
 */
export function DiagnosticsPanel() {
  return (
    <Panel className="flex flex-col gap-8 p-6 sm:p-8">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[
          { k: "Network", v: `BNB Testnet (${String(CHAIN_ID)})` },
          { k: "Status", v: "Live", dot: true },
          { k: "Core contracts", v: `${String(TESTNET_CONTRACTS.length)} deployed` },
          { k: "Live since block", v: DEPLOYMENT_BLOCK },
        ].map((stat) => (
          <div key={stat.k} className="flex flex-col gap-1">
            <dt className="font-mono text-xs uppercase tracking-[0.14em] text-midnight/45">
              {stat.k}
            </dt>
            <dd className="flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums text-midnight">
              {stat.dot ? (
                <span aria-hidden className="h-2 w-2 rounded-full bg-liquid-mint" />
              ) : null}
              {stat.v}
            </dd>
          </div>
        ))}
      </dl>

      <ul className="flex flex-col divide-y divide-midnight/10 border-y border-midnight/10">
        {TESTNET_CONTRACTS.map((contract) => (
          <li key={contract.key}>
            <a
              href={bscScanAddress(contract.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col gap-1 py-3 transition-colors hover:bg-midnight/[0.03] sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex flex-col gap-0.5">
                <span className="font-heading text-sm font-semibold text-midnight group-hover:underline">
                  {contract.label}
                </span>
                <span className="text-xs text-midnight/50">{contract.note}</span>
              </span>
              <span className="font-mono text-xs text-midnight/45 group-hover:text-midnight/70">
                {contract.address}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <MonoTag className="mr-1 self-center">Vaults</MonoTag>
        {TESTNET_VAULTS.map((vault) => (
          <a
            key={vault.key}
            href={bscScanAddress(vault.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-pill border border-midnight/20 px-3 py-1 text-xs font-medium text-midnight/80 transition-colors hover:border-liquid-mint/60 hover:text-midnight"
          >
            {vault.label}
          </a>
        ))}
      </div>
    </Panel>
  );
}
