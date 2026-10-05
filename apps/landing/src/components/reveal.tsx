"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Scroll-reveal wrapper. Content is visible by default (SSR + no-JS + reduced
 * motion all render it fully shown — the hidden/animated state lives entirely in
 * CSS behind `prefers-reduced-motion: no-preference`). On capable clients this
 * flips below-the-fold content to `data-reveal="hidden"` (off-screen, so no
 * visible flash) and back to `"shown"` when it scrolls into view. Once only.
 *
 * A thin client wrapper over server-rendered children, so the content stays in
 * the SSR HTML.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    // Already on screen at mount → reveal immediately, no hide (no flash).
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setState("shown");
      return;
    }

    // Off-screen → hide now (invisible to the user) and reveal when it enters.
    setState("hidden");
    const observer = new IntersectionObserver(
      (entries, obs) => {
        if (entries[0]?.isIntersecting) {
          setState("shown");
          obs.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={ref} data-reveal={state} className={className}>
      {children}
    </div>
  );
}
