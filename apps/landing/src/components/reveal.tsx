"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Scroll-reveal wrapper. Each section fades and rises into place the first time
 * it enters the viewport — a calm, confident motion that matches the site's
 * refined tone. A client wrapper around server-rendered children, so content
 * stays in the SSR HTML. Fully bypassed for `prefers-reduced-motion`.
 */
interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Extra delay (seconds) — useful to cascade a couple of sibling reveals. */
  delay?: number;
  /** Vertical travel in px (default 32). */
  y?: number;
}

export function Reveal({ children, className, delay = 0, y = 32 }: RevealProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return className ? <div className={className}>{children}</div> : <>{children}</>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
