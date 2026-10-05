"use client";

import { buttonVariants } from "@matura/ui/components/button";
import { cn } from "@matura/ui/lib/utils";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { APP_URL } from "../lib/site";

/**
 * "Matura Account" gallery — a sliding peek carousel of the income types that can
 * become verified, routable claims.
 *
 * Each tile is absolutely positioned and sized from its distance to the active
 * tile, and CSS transitions on transform + width make selection *slide*: the
 * chosen tile widens and slides into the wide left slot while the old one shrinks
 * and slides off the left edge. The ring wraps off-screen, so it loops infinitely
 * (arrows, clicks, or the 4s autoplay). Each type has a representative photo in
 * /public/claims with the brand gradient as a fallback behind it. Some types
 * (reimbursement, rental, tax refund, …) aren't onboarded yet — flagged
 * "Roadmap" — but all are verifiable future income.
 */

interface ClaimType {
  value: string;
  label: string;
  explanation: string;
  gradient: string;
  live: boolean;
}

const CLAIMS: ClaimType[] = [
  {
    value: "salary",
    label: "Earned salary",
    explanation: "Draw your paycheck the day it's earned — not two weeks later.",
    gradient: "linear-gradient(135deg, #111827 0%, #2b3a55 100%)",
    live: true,
  },
  {
    value: "freelance",
    label: "Freelance payout",
    explanation: "Turn a cleared invoice into cash now, instead of waiting on net-30.",
    gradient: "linear-gradient(135deg, #2a78d6 0%, #7fb2a6 100%)",
    live: true,
  },
  {
    value: "marketplace",
    label: "Marketplace settlement",
    explanation: "Access confirmed sales before the platform's payout window opens.",
    gradient: "linear-gradient(135deg, #2b3a55 0%, #1baf7a 100%)",
    live: true,
  },
  {
    value: "stream",
    label: "Onchain stream",
    explanation: "Advance against vesting or streamed income already accrued on-chain.",
    gradient: "linear-gradient(135deg, #1baf7a 0%, #42e8b4 100%)",
    live: true,
  },
  {
    value: "reimbursement",
    label: "Reimbursement",
    explanation: "Get approved expenses back before the next reimbursement run.",
    gradient: "linear-gradient(135deg, #7fb2a6 0%, #2a78d6 100%)",
    live: false,
  },
  {
    value: "creator",
    label: "Creator payout",
    explanation: "Unlock confirmed platform earnings without waiting for payout day.",
    gradient: "linear-gradient(135deg, #2b3a55 0%, #2a78d6 100%)",
    live: false,
  },
  {
    value: "rental",
    label: "Rental income",
    explanation: "Borrow against rent that's contractually due but not yet collected.",
    gradient: "linear-gradient(135deg, #1baf7a 0%, #2b3a55 100%)",
    live: false,
  },
  {
    value: "refund",
    label: "Tax refund",
    explanation: "Advance a filed, approved refund instead of waiting on the tax office.",
    gradient: "linear-gradient(135deg, #2a78d6 0%, #42e8b4 100%)",
    live: false,
  },
];

const AUTOPLAY_MS = 4000;
const GAP = 12;
const SLIVER = 56;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Graduated peek widths for the right-hand fan; distant tiles are uniform slivers. */
function peekWidth(slot: number): number {
  if (slot === 1) return 224;
  if (slot === 2) return 160;
  if (slot === 3) return 112;
  return SLIVER;
}

/** Resting x + width for a tile, by its signed slot relative to the active (slot 0). */
function placement(slot: number, featuredWidth: number): { x: number; w: number } {
  if (slot === 0) return { x: 0, w: featuredWidth };
  if (slot > 0) {
    let x = featuredWidth + GAP;
    for (let k = 1; k < slot; k++) x += peekWidth(k) + GAP;
    return { x, w: peekWidth(slot) };
  }
  // slot < 0: a sliver parked off the left edge (the tile sliding out / already gone).
  return { x: slot * (SLIVER + GAP), w: SLIVER };
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === "left" ? (
        <>
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </>
      ) : (
        <>
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </>
      )}
    </svg>
  );
}

export function ClaimGallery() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [trackWidth, setTrackWidth] = useState(1152);
  const trackRef = useRef<HTMLDivElement>(null);
  const prevSlots = useRef<Map<string, number>>(new Map());

  const count = CLAIMS.length;
  const current = CLAIMS[active];
  const featuredWidth = Math.round(trackWidth * (trackWidth < 640 ? 0.82 : 0.58));

  const go = (delta: number) => {
    setActive((index) => (index + delta + count) % count);
  };

  // Measure the track so the featured width can be a fraction of it.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setTrackWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, []);

  // Respect reduced motion for both the slide and autoplay.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setReduceMotion(mq.matches);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
    };
  }, []);

  // Autoplay every 4s — paused on hover/focus and when reduced motion is on.
  // `active` is a dep so manual navigation (arrows/tile taps) re-arms the clock,
  // preventing a double-advance right after the user picks a tile (notably on
  // touch, where there's no hover to pause it).
  useEffect(() => {
    if (paused || reduceMotion) return;
    const id = window.setInterval(() => {
      setActive((index) => (index + 1) % count);
    }, AUTOPLAY_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [paused, reduceMotion, count, active]);

  const slots = CLAIMS.map((_, index) => {
    const raw = (index - active + count) % count;
    return raw <= count / 2 ? raw : raw - count;
  });

  // A tile crossing the off-screen wrap seam jumps slots; suppress its transition
  // so it repositions instantly (invisibly) instead of flying across the track.
  const tiles = CLAIMS.map((claim, index) => {
    const slot = slots[index] ?? 0;
    const prev = prevSlots.current.get(claim.value);
    const wrapped = prev !== undefined && Math.abs(slot - prev) > count / 2;
    return { claim, index, slot, wrapped };
  });

  useEffect(() => {
    const next = new Map<string, number>();
    CLAIMS.forEach((claim, index) => next.set(claim.value, slots[index] ?? 0));
    prevSlots.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const controlClass =
    "inline-flex h-11 w-11 items-center justify-center rounded-xl border border-midnight/10 bg-background text-midnight shadow-sm transition-colors hover:border-liquid-mint/50 hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <div
      className="flex flex-col gap-6"
      onMouseEnter={() => {
        setPaused(true);
      }}
      onMouseLeave={() => {
        setPaused(false);
      }}
      onFocusCapture={() => {
        setPaused(true);
      }}
      onBlurCapture={() => {
        setPaused(false);
      }}
    >
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          aria-label="Previous income type"
          className={controlClass}
          onClick={() => {
            go(-1);
          }}
        >
          <ArrowIcon direction="left" />
        </button>
        <button
          type="button"
          aria-label="Next income type"
          className={controlClass}
          onClick={() => {
            go(1);
          }}
        >
          <ArrowIcon direction="right" />
        </button>
      </div>

      <div ref={trackRef} className="relative h-[320px] overflow-hidden sm:h-[400px]">
        {tiles.map(({ claim, index, slot, wrapped }) => {
          const isFeatured = slot === 0;
          const { x, w } = placement(slot, featuredWidth);
          const animate = !reduceMotion && !wrapped;
          return (
            <div
              key={claim.value}
              aria-current={isFeatured ? "true" : undefined}
              className="absolute left-0 top-0 h-full overflow-hidden rounded-2xl ring-1 ring-midnight/5"
              style={{
                width: `${String(w)}px`,
                transform: `translateX(${String(x)}px)`,
                transition: animate ? `transform 560ms ${EASE}, width 560ms ${EASE}` : "none",
                background: claim.gradient,
                zIndex: isFeatured ? 2 : 1,
              }}
            >
              <Image
                src={`/claims/${claim.value}.webp`}
                alt=""
                fill
                unoptimized
                loading="lazy"
                sizes="(max-width: 640px) 82vw, 58vw"
                className="object-cover"
              />
              <span
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent"
              />

              {isFeatured ? (
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-5 sm:p-6">
                  <span className="font-heading text-lg font-semibold text-white sm:text-2xl">
                    {claim.label}
                  </span>
                  {!claim.live ? (
                    <span className="rounded-pill bg-white/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/80">
                      Roadmap
                    </span>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  aria-label={`Show ${claim.label}`}
                  className="absolute inset-0 cursor-pointer transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-liquid-mint"
                  onClick={() => {
                    setActive(index);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-[56ch] text-lg leading-relaxed text-midnight/70">
          {current?.explanation}
        </p>
        <a href={APP_URL} className={cn(buttonVariants({ size: "lg" }), "shrink-0")}>
          Open your account
        </a>
      </div>
    </div>
  );
}
