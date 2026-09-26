import type { ComponentProps } from "react";

import { cn } from "../lib/utils";

export type LabelProps = ComponentProps<"label">;

/**
 * Form field label. Fades when its associated control is disabled.
 */
export function Label({ className, ...props }: LabelProps) {
  return (
    <label
      data-slot="label"
      className={cn(
        "text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}
