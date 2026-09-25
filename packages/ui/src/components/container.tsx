import type { ComponentProps } from "react";

import { cn } from "../lib/utils";

export type ContainerProps = ComponentProps<"div">;

/**
 * Centered max-width layout wrapper with responsive horizontal gutters.
 */
export function Container({ className, ...props }: ContainerProps) {
  return (
    <div
      data-slot="container"
      className={cn("mx-auto w-full max-w-6xl px-gutter", className)}
      {...props}
    />
  );
}
