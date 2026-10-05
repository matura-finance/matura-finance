import { cn } from "@matura/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";

import { Reveal } from "./reveal";

/**
 * Shared, server-only marketing primitives. No wallet, no client state.
 * They encode the Matura contrast law so pages can't accidentally break it:
 * on Mist, Liquid Mint appears only as a fill/tick, never as copy.
 */

type Tone = "light" | "dark";

/**
 * Section band. The dark tones (`deep-night`, `night-raised`) add the `dark`
 * class so semantic tokens (focus ring → mint, borders) flip and Liquid Mint
 * becomes contrast-legal. `night-raised` is a subtly lifted surface used to
 * separate adjacent dark bands without leaving the dark palette.
 */
export function Section({
  tone = "mist",
  reveal = true,
  className,
  children,
  ...props
}: ComponentProps<"section"> & {
  tone?: "mist" | "card" | "deep-night" | "night-raised";
  /** Wrap the content in a scroll-reveal (default true; off for the hero). */
  reveal?: boolean;
}) {
  const toneClass =
    tone === "deep-night"
      ? "dark bg-deep-night text-mist"
      : tone === "night-raised"
        ? "dark bg-midnight text-mist"
        : tone === "card"
          ? "bg-background text-midnight"
          : "bg-mist text-midnight";
  return (
    <section className={cn("py-[clamp(4rem,8vw,8rem)]", toneClass, className)} {...props}>
      {reveal ? <Reveal>{children}</Reveal> : children}
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

/** Centered max-width content container shared by every section. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-gutter", className)}>{children}</div>;
}

/**
 * A bordered "cell" — the core building block of the layout. Theme-adaptive:
 * light ink border on Mist by default, and a hairline mist border inside dark
 * (`.dark`) accent bands. Subtle mint-tinted hover lift in both.
 */
export function Panel({
  as: Tag = "div",
  className,
  children,
}: {
  as?: "div" | "li" | "article";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        "rounded-card border p-6 transition-colors",
        "border-midnight/10 bg-background dark:border-mist/10 dark:bg-mist/[0.03]",
        "hover:border-liquid-mint/50 dark:hover:border-liquid-mint/40",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Uppercase monospace micro-label — the "readout" typography. Theme-adaptive. */
export function MonoTag({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "font-mono text-xs uppercase tracking-[0.18em] text-midnight/50 dark:text-mist/50",
        className,
      )}
    >
      {children}
    </span>
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
