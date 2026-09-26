import { cn } from "@matura/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";

/**
 * Shared, server-only marketing primitives. No wallet, no client state.
 * They encode the Matura contrast law so pages can't accidentally break it:
 * on Mist, Liquid Mint appears only as a fill/tick, never as copy.
 */

type Tone = "light" | "dark";

/**
 * Section band. `tone="deep-night"` adds the `dark` class so semantic tokens
 * (focus ring → mint, borders) flip and mint becomes contrast-legal.
 */
export function Section({
  tone = "mist",
  className,
  children,
  ...props
}: ComponentProps<"section"> & { tone?: "mist" | "card" | "deep-night" }) {
  const toneClass =
    tone === "deep-night"
      ? "dark bg-deep-night text-mist"
      : tone === "card"
        ? "bg-background text-midnight"
        : "bg-mist text-midnight";
  return (
    <section className={cn("py-[clamp(4rem,8vw,8rem)]", toneClass, className)} {...props}>
      {children}
    </section>
  );
}

/**
 * Eyebrow label. A Liquid Mint tick (a fill, always legal) precedes ink copy —
 * never mint text on light.
 */
export function Eyebrow({ children, tone = "light" }: { children: ReactNode; tone?: Tone }) {
  return (
    <p
      className={cn(
        "flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.2em]",
        tone === "dark" ? "text-mist/80" : "text-midnight",
      )}
    >
      <span aria-hidden className="inline-block h-1.5 w-6 rounded-full bg-liquid-mint" />
      {children}
    </p>
  );
}

/** Display heading (Manrope). */
export function DisplayHeading({
  as: Tag = "h2",
  className,
  children,
}: {
  as?: "h1" | "h2";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        "font-heading font-bold tracking-[-0.03em]",
        Tag === "h1"
          ? "text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.02]"
          : "text-[clamp(2rem,4vw,3rem)] leading-[1.08]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Lede paragraph beneath a heading. */
export function Lede({
  className,
  tone = "light",
  children,
}: {
  className?: string;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "max-w-[46ch] text-lg leading-relaxed",
        tone === "dark" ? "text-mist/70" : "text-midnight/70",
        className,
      )}
    >
      {children}
    </p>
  );
}
