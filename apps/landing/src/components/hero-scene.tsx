import { AllocationBar } from "@matura/ui/components/allocation-bar";

/**
 * Hero visual slot.
 *
 * ── 3D component mount point ──────────────────────────────────────────────
 * The interactive Three.js scene (ThreeUI "Sublevel Studio" layout, recolored
 * to the Matura palette) will be dropped in here later. When that component is
 * provided, mount it CLIENT-ONLY so the page shell stays static + SSR-safe and
 * SEO-crawlable, e.g. in a sibling `hero-scene.client.tsx`:
 *
 *     "use client";
 *     import dynamic from "next/dynamic";
 *     const Scene = dynamic(() => import("<provided-component>"), { ssr: false });
 *     export function HeroSceneCanvas() {
 *       return <div className="shader-frame"><Scene /></div>;
 *     }
 *
 * Then render <HeroSceneCanvas/> above this fallback and hide the fallback once
 * WebGL is available. Keep this static schematic as the reduced-motion / no-WebGL
 * fallback so hero content is never gated behind the canvas.
 *
 * Until the component lands, this renders a self-contained, static SVG
 * "one amount → allocated slices" schematic. Purely presentational — all meaning
 * lives in the hero copy, so the figure is `aria-hidden`.
 * ──────────────────────────────────────────────────────────────────────────
 */
export function HeroScene() {
  return (
    <div className="animate-rise [--rise-delay:150ms]">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-card border border-midnight/10 bg-background p-6 shadow-sm">
        {/* Corner registration ticks — the "instrument panel" framing. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-3 h-3 w-3 border-l border-t border-liquid-mint/60"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-3 h-3 w-3 border-r border-t border-liquid-mint/60"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-3 left-3 h-3 w-3 border-b border-l border-liquid-mint/60"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-3 right-3 h-3 w-3 border-b border-r border-liquid-mint/60"
        />

        <figure aria-hidden className="flex h-full flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-midnight/50">
              One request
            </span>
            <span className="rounded-pill bg-liquid-mint px-3 py-1 font-mono text-sm font-semibold text-midnight tabular-nums">
              10,000
            </span>
          </div>

          {/* Branching flow-line: one amount fanning out to competing vaults. */}
          <svg viewBox="0 0 240 160" className="my-2 w-full" role="presentation">
            <g fill="none" stroke="currentColor" className="text-midnight/25" strokeWidth="1.5">
              <path className="animate-flow" d="M120 8 V44" />
              <path className="animate-flow" d="M120 44 C120 80 40 80 40 116" />
              <path className="animate-flow" d="M120 44 V116" />
              <path className="animate-flow" d="M120 44 C120 80 200 80 200 116" />
            </g>
            <g>
              <circle cx="40" cy="120" r="7" fill="var(--color-vault-1)" />
              <circle cx="120" cy="120" r="7" fill="var(--color-vault-2)" />
              <circle cx="200" cy="120" r="7" fill="var(--color-vault-3)" />
            </g>
          </svg>

          <div className="flex flex-col gap-3">
            <AllocationBar
              segments={[
                { key: "v1", label: "Vault A", widthPct: 46, colorVar: "--color-vault-1" },
                { key: "v2", label: "Vault B", widthPct: 30, colorVar: "--color-vault-2" },
              ]}
              retained={{ label: "Retained", widthPct: 24 }}
            />
            <div className="flex items-center justify-between font-mono text-xs text-midnight/55">
              <span>Best executable route</span>
              <span className="tabular-nums">3 vaults compared</span>
            </div>
          </div>
        </figure>
      </div>
    </div>
  );
}
