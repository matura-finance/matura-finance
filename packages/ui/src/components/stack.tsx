import type { ComponentProps } from "react";

import { cn } from "../lib/utils";

type StackDirection = "vertical" | "horizontal";
type StackGap = "none" | "sm" | "md" | "lg" | "xl";

const directionClasses: Record<StackDirection, string> = {
  vertical: "flex-col",
  horizontal: "flex-row",
};

const gapClasses: Record<StackGap, string> = {
  none: "gap-0",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
};

export type StackProps = ComponentProps<"div"> & {
  direction?: StackDirection;
  gap?: StackGap;
};

/**
 * Flexbox layout primitive. Arranges children in a vertical or horizontal
 * stack with a spacing scale.
 */
export function Stack({ className, direction = "vertical", gap = "md", ...props }: StackProps) {
  return (
    <div
      data-slot="stack"
      className={cn("flex", directionClasses[direction], gapClasses[gap], className)}
      {...props}
    />
  );
}
