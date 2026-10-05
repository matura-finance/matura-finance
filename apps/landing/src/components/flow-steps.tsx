"use client";

import { cn } from "@matura/ui/lib/utils";
import { useEffect, useRef, useState } from "react";

/**
 * "How it works" — four pinned notes scattered in a zig-zag (alternating sides,
 * each at a different height) and joined by an animated dashed connector that
 * flows from one note to the next. Kept on the light palette; each note carries
 * a brand vault-ramp accent.
 *
 * The connector is an SVG path whose points are measured from the real card
 * positions (a ResizeObserver keeps it in sync across breakpoints), so the zig-
 * zag can be pure CSS grid placement while the line still lands on each note.
 */

const STEPS = [
  {
    title: "Verify",
    body: "An approved issuer attests the amount, payee, and due date — the claim lands in your account.",
  },
  {
    title: "Compare",
    body: "The router prices eligible vaults against your request, pinned to a block.",
  },
  {
    title: "Route",
    body: "Review the cheapest verifiable route, then sign it in your wallet. Non-custodial.",
  },
  {
    title: "Settle",
    body: "Every leg is re-checked on-chain and funded atomically. The issuer settles at maturity.",
  },
];

const ACCENTS = ["#2a78d6", "#1baf7a", "#2b3a55", "#7fb2a6"];
const COL = ["lg:col-start-1", "lg:col-start-2", "lg:col-start-1", "lg:col-start-2"];
const ROW = ["lg:row-start-1", "lg:row-start-2", "lg:row-start-3", "lg:row-start-4"];
const JUSTIFY = [
  "lg:justify-self-start",
  "lg:justify-self-end",
  "lg:justify-self-start",
  "lg:justify-self-end",
];
// Pull each column slightly inward so the X spread is wide but not extreme.
const SHIFT = [
  "lg:translate-x-24",
  "lg:-translate-x-24",
  "lg:translate-x-24",
  "lg:-translate-x-24",
];
const ROTATION = ["rotate-[-3deg]", "rotate-[2deg]", "rotate-[-2deg]", "rotate-[3deg]"];

function StepPin({ color }: { color: string }) {
  return (
    <span aria-hidden className="absolute left-1/2 top-2.5 z-10 -translate-x-1/2" style={{ color }}>
      <svg width="20" height="26" viewBox="0 0 20 26" fill="currentColor">
        <path d="M10 1a5 5 0 0 1 5 5c0 2.1-1.3 3.6-2.7 4.6l.7 3.9H7l.7-3.9C6.3 9.6 5 8.1 5 6a5 5 0 0 1 5-5Z" />
        <rect x="9.25" y="13" width="1.5" height="11" rx="0.75" opacity="0.5" />
      </svg>
    </span>
  );
}

export function FlowSteps() {
  const gridRef = useRef<HTMLOListElement>(null);
  const cardRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [geometry, setGeometry] = useState({ path: "", w: 0, h: 0 });

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const recompute = () => {
      const gr = grid.getBoundingClientRect();
      const points = cardRefs.current
        .filter((el): el is HTMLLIElement => el !== null)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            left: r.left - gr.left,
            right: r.right - gr.left,
            top: r.top - gr.top,
            bottom: r.bottom - gr.top,
            cx: r.left - gr.left + r.width / 2,
            cy: r.top - gr.top + r.height / 2,
          };
        });

      // Connect the *facing sides* of consecutive notes with a horizontal-tangent
      // cubic bezier (an S). Endpoints attach to the card edge (tucked a few px
      // under it, since the SVG is behind the cards, so the line clearly comes
      // from the box) and are offset vertically — the line leaves low on one note
      // and arrives high on the next, not both from the same mid-point.
      const TUCK = 4; // px the endpoints sit inside the card edge, so they connect
      let d = "";
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (!a || !b) continue;
        const aLeftOfB = a.cx <= b.cx;
        const start = {
          x: (aLeftOfB ? a.right : a.left) + (aLeftOfB ? -TUCK : TUCK),
          y: a.cy + (a.bottom - a.top) * 0.22,
        };
        const end = {
          x: (aLeftOfB ? b.left : b.right) + (aLeftOfB ? TUCK : -TUCK),
          y: b.cy - (b.bottom - b.top) * 0.22,
        };
        const k = Math.max(60, Math.abs(end.x - start.x) * 0.55);
        const c1x = aLeftOfB ? start.x + k : start.x - k;
        const c2x = aLeftOfB ? end.x - k : end.x + k;
        d +=
          `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} ` +
          `C ${c1x.toFixed(1)} ${start.y.toFixed(1)} ${c2x.toFixed(1)} ${end.y.toFixed(1)} ` +
          `${end.x.toFixed(1)} ${end.y.toFixed(1)} `;
      }
      setGeometry({ path: d.trim(), w: gr.width, h: gr.height });
    };

    recompute();
    // Observing the grid catches layout-size changes (incl. font-swap reflow,
    // which also changes the grid's row heights). The hover-straighten rotates a
    // card (a transform) without changing layout size — ResizeObserver stays
    // silent for that — so recompute when that transition ends too.
    const ro = new ResizeObserver(recompute);
    ro.observe(grid);
    grid.addEventListener("transitionend", recompute);
    return () => {
      ro.disconnect();
      grid.removeEventListener("transitionend", recompute);
    };
  }, []);

  return (
    <div className="relative">
      <svg
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 text-midnight/30"
        width={geometry.w}
        height={geometry.h}
      >
        <path
          d={geometry.path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="5 6"
          strokeLinecap="round"
          className="flow-connector"
        />
      </svg>

      <ol
        ref={gridRef}
        className="relative grid grid-cols-1 gap-y-12 lg:grid-cols-2 lg:gap-x-10 lg:gap-y-6"
      >
        {STEPS.map((step, i) => {
          const accent = ACCENTS[i] ?? ACCENTS[0] ?? "#2a78d6";
          return (
            <li
              key={step.title}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className={cn(
                "w-full transition-transform duration-300 hover:rotate-0 lg:max-w-sm",
                COL[i],
                ROW[i],
                JUSTIFY[i],
                SHIFT[i],
                ROTATION[i],
              )}
            >
              <div className="relative rounded-2xl border border-midnight/10 bg-background px-3 pb-3 pt-8 shadow-lg shadow-midnight/5">
                <StepPin color={accent} />
                <div
                  className="rounded-xl border p-5"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${accent} 7%, var(--color-background))`,
                    borderColor: `color-mix(in srgb, ${accent} 28%, transparent)`,
                  }}
                >
                  <span
                    className="font-heading text-4xl font-bold tabular-nums"
                    style={{ color: accent }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 font-heading text-lg font-bold text-midnight">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-midnight/60">{step.body}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
