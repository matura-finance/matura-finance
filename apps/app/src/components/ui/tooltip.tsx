"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * Hover/focus tooltip that renders the bubble with `position: fixed`, so it escapes ancestor
 * `overflow` clipping (the data table wraps its rows in an `overflow-x-auto` box, which also clips
 * vertically). Coordinates are captured from the trigger on enter; the bubble sits just above it.
 *
 * `mono` renders a code-style bubble that wraps on any character (for ids/addresses); the default
 * renders readable prose that wraps on words (for explanatory hints).
 */
export function Tooltip({
  label,
  children,
  className,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left, y: r.top });
  };
  const hide = () => {
    setPos(null);
  };

  return (
    <span
      ref={ref}
      tabIndex={0}
      className={`inline-flex outline-none ${className ?? ""}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {pos !== null && (
        <span
          role="tooltip"
          style={{ left: pos.x, top: pos.y }}
          className={`pointer-events-none fixed z-50 -translate-y-[calc(100%+6px)] rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md ${
            mono
              ? "max-w-[22rem] break-all font-mono leading-snug"
              : "max-w-xs whitespace-normal leading-relaxed"
          }`}
        >
          {label}
        </span>
      )}
    </span>
  );
}

/**
 * Small circled "?" that reveals an explanatory tooltip on hover or focus. Place next to a label
 * whose meaning isn't self-evident.
 */
export function InfoHint({ label }: { label: string }) {
  return (
    <Tooltip label={label}>
      <span
        aria-label="More info"
        className="flex size-4 cursor-help items-center justify-center rounded-full border border-border text-[10px] font-semibold leading-none text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
      >
        ?
      </span>
    </Tooltip>
  );
}
