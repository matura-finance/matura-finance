import type { ComponentProps } from "react";

import { cn } from "../lib/utils";

/**
 * Data table. Wrapped in an `overflow-x-auto` container so wide tables scroll
 * within their own box instead of overflowing the page.
 */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div data-slot="table-wrapper" className="w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function THead({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-head"
      className={cn("border-b border-border text-muted-foreground", className)}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("border-b border-border transition-colors hover:bg-muted/50", className)}
      {...props}
    />
  );
}

type CellProps<T> = T & {
  /** Right-aligns and mono-formats numeric values with tabular figures. */
  numeric?: boolean;
};

export function TH({ className, numeric, ...props }: CellProps<ComponentProps<"th">>) {
  return (
    <th
      data-slot="table-header-cell"
      className={cn(
        "px-3 py-2 text-left align-middle font-medium",
        numeric && "text-right tabular-nums font-mono",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, numeric, ...props }: CellProps<ComponentProps<"td">>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2 align-middle",
        numeric && "text-right tabular-nums font-mono",
        className,
      )}
      {...props}
    />
  );
}
