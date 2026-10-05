import { AllocationBar } from "@matura/ui/components/allocation-bar";

/**
 * Hero centerpiece — a static, on-brand mock of the Matura product dashboard.
 *
 * Replaces the template's "dashboard UI frame" screenshot with a built preview
 * in the Matura palette: the unified account (verified claims) on the left and
 * the best-execution route (allocation + summary) on the right. Purely
 * presentational — all meaning lives in the hero copy, so the figure is
 * `aria-hidden` and tagged "Illustrative" so it is never read as live data.
 *
 * Server component. No wallet, no client state. Numbers mirror the router
 * section's example route (46% / 30% financed, 24% retained) for consistency.
 */

const CLAIMS = [
  { label: "Earned salary", note: "Payroll · verified", amount: "3,200.00" },
  { label: "Freelance payout", note: "Invoice cleared · verified", amount: "4,800.00" },
  { label: "Onchain stream", note: "Vesting · verified", amount: "2,000.00" },
] as const;

const SUMMARY = [
  { k: "Received now", v: "7,463.40" },
  { k: "Total cost", v: "136.60" },
  { k: "You retain", v: "2,400.00" },
] as const;

export function HeroDashboard() {
  return (
    <div className="relative w-full rounded-2xl border border-midnight/10 bg-background/70 p-3 shadow-xl shadow-midnight/5 backdrop-blur-xl sm:p-4">
      <div
        aria-hidden
        className="overflow-hidden rounded-xl border border-midnight/10 bg-background"
      >
        {/* Window chrome */}
        <div className="flex items-center justify-between border-b border-midnight/10 bg-mist/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-midnight/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-midnight/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-midnight/15" />
          </div>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-midnight/50">
            Matura · Account
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-background px-2.5 py-0.5 font-mono text-[11px] font-semibold text-midnight ring-1 ring-midnight/10">
            <span className="h-1.5 w-1.5 rounded-full bg-liquid-mint" />
            Live
          </span>
        </div>

        {/* Body */}
        <div className="grid gap-px bg-midnight/10 md:grid-cols-12">
          {/* Claims — the unified account */}
          <div className="bg-background p-5 md:col-span-7">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-midnight/50">
                Your claims
              </span>
              <span className="font-mono text-xs tabular-nums text-midnight/45">
                10,000.00 eligible
              </span>
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {CLAIMS.map((claim) => (
                <li
                  key={claim.label}
                  className="flex items-center gap-3.5 rounded-card border border-midnight/10 px-4 py-3"
                >
                  <span className="h-1.5 w-6 shrink-0 rounded-pill bg-liquid-mint" />
                  <span className="flex min-w-0 flex-col gap-0.5 text-left">
                    <span className="truncate font-heading text-sm font-semibold text-midnight">
                      {claim.label}
                    </span>
                    <span className="truncate text-xs text-midnight/50">{claim.note}</span>
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-sm font-medium tabular-nums text-midnight">
                    {claim.amount}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Best route */}
          <div className="flex flex-col gap-4 bg-background p-5 md:col-span-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-midnight/50">
                Best route
              </span>
              <span className="rounded-pill border border-midnight/15 px-2 py-0.5 font-mono text-[11px] text-midnight/55">
                3 vaults compared
              </span>
            </div>

            <AllocationBar
              segments={[
                {
                  key: "vault-a",
                  label: "Vault A · 1.6%",
                  widthPct: 46,
                  colorVar: "--color-vault-1",
                },
                {
                  key: "vault-b",
                  label: "Vault B · 2.1%",
                  widthPct: 30,
                  colorVar: "--color-vault-2",
                },
              ]}
              retained={{ label: "You retain", widthPct: 24 }}
            />

            <dl className="flex flex-col gap-2">
              {SUMMARY.map((row) => (
                <div
                  key={row.k}
                  className="flex items-baseline justify-between gap-3 border-b border-midnight/10 pb-1.5 last:border-b-0 last:pb-0"
                >
                  <dt className="text-sm text-midnight/60">{row.k}</dt>
                  <dd className="font-mono text-sm font-semibold tabular-nums text-midnight">
                    {row.v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* Honest framing: this is an illustrative preview, not live data. */}
      <span className="pointer-events-none absolute -top-2.5 right-4 rounded-pill border border-midnight/15 bg-background px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-midnight/55">
        Illustrative
      </span>
    </div>
  );
}
