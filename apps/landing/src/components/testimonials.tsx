import { cn } from "@matura/ui/lib/utils";
import type { CSSProperties } from "react";

/**
 * "What our users say" — three columns of testimonial cards that scroll up on an
 * infinite CSS marquee (each column duplicated so the loop is seamless). Goes
 * static for reduced motion, and `content-visibility: auto` lets the browser
 * skip the animation while the block is off-screen. Server component, no client JS.
 *
 * These testimonials are illustrative mock copy for the prototype; avatars are
 * initials badges, not photos of real people.
 */

interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

const COLUMNS: Testimonial[][] = [
  [
    {
      quote:
        "Got my earned salary days before payday — at a better rate than any advance app I'd tried.",
      name: "Mara Lindqvist",
      role: "Freelance Designer",
    },
    {
      quote:
        "Matura found a cheaper route than my invoice factor, and I only drew what I actually needed.",
      name: "Devin Oyelaran",
      role: "Studio Owner",
    },
    {
      quote:
        "One account for salary, freelance, and streams — finally a single view of everything I'm owed.",
      name: "Noah Behrens",
      role: "Multi-hyphenate",
    },
  ],
  [
    {
      quote:
        "Non-custodial actually means something here. I signed, my funds moved, nobody held my keys.",
      name: "Priya Nandakumar",
      role: "Indie Developer",
    },
    {
      quote:
        "Partial slicing is the feature I didn't know I needed — I took $300, not the whole invoice.",
      name: "Aisha Karim",
      role: "Consultant",
    },
    {
      quote: "The quote matched the settlement to the cent. Zero surprises.",
      name: "Leo Marchetti",
      role: "Marketplace Seller",
    },
  ],
  [
    {
      quote: "We plugged our payouts in once, and our whole creator base got instant access.",
      name: "Tomas Ribeiro",
      role: "Platform Lead",
    },
    {
      quote:
        "Vaults competing for my request felt like the opposite of take-it-or-leave-it pricing.",
      name: "Sofia Delgado",
      role: "Contractor",
    },
    {
      quote:
        "Reconciliation and reports just happen now. Our finance team got their weekends back.",
      name: "Elena Volkova",
      role: "Finance Ops",
    },
  ],
];

const AVATAR_COLORS = ["#2a78d6", "#1baf7a", "#2b3a55", "#7fb2a6"];
const COLUMN_DURATIONS = ["34s", "26s", "40s"];
const COLUMN_VISIBILITY = ["flex", "hidden sm:flex", "hidden lg:flex"];

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Card({ t, index }: { t: Testimonial; index: number }) {
  return (
    <figure className="mb-5 rounded-2xl border border-midnight/10 bg-background p-6 shadow-sm">
      <blockquote className="text-sm leading-relaxed text-midnight/80">
        &ldquo;{t.quote}&rdquo;
      </blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-heading text-sm font-bold text-white"
          style={{ background: AVATAR_COLORS[index % AVATAR_COLORS.length] }}
        >
          {initials(t.name)}
        </span>
        <span className="flex flex-col">
          <span className="font-heading text-sm font-semibold text-midnight">{t.name}</span>
          <span className="text-xs text-midnight/50">{t.role}</span>
        </span>
      </figcaption>
    </figure>
  );
}

export function Testimonials() {
  return (
    <div
      className="relative grid h-[34rem] grid-cols-1 gap-5 overflow-hidden [contain-intrinsic-size:auto_34rem] [content-visibility:auto] sm:grid-cols-2 lg:grid-cols-3"
      style={{
        maskImage: "linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent)",
      }}
    >
      {COLUMNS.map((column, col) => (
        <div
          key={`col-${String(col)}`}
          className={cn("marquee-up flex-col", COLUMN_VISIBILITY[col])}
          style={{ "--marquee-duration": COLUMN_DURATIONS[col] } as CSSProperties}
        >
          {[...column, ...column].map((t, i) => (
            <Card key={`${t.name}-${String(i)}`} t={t} index={col * 3 + (i % column.length)} />
          ))}
        </div>
      ))}
    </div>
  );
}
