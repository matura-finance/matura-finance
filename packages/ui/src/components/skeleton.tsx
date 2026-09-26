import type { ComponentProps } from "react";

import { cn } from "../lib/utils";

/**
 * Loading placeholder. Pulses to signal pending content; the animation is
 * suppressed under `prefers-reduced-motion`.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  );
}
