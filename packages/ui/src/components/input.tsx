import type { ComponentProps } from "react";

import { cn } from "../lib/utils";

export type InputProps = ComponentProps<"input">;

/**
 * Text input. Focus-visible ring via `ring-ring`; invalid state (driven by
 * `aria-invalid`) recolours the border and ring with the destructive token.
 */
export function Input({ className, type = "text", ...props }: InputProps) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive",
        className,
      )}
      {...props}
    />
  );
}
