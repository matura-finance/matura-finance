"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * Hover/focus tooltip that renders the bubble with `position: fixed`, so it escapes ancestor
 * `overflow` clipping (the data table wraps its rows in an `overflow-x-auto` box, which also clips
 * vertically). Coordinates are captured from the trigger on enter; the bubble sits just above it.
 */
export function Tooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
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
          className="pointer-events-none fixed z-50 max-w-[22rem] -translate-y-[calc(100%+6px)] break-all rounded-md bg-foreground px-2 py-1 font-mono text-xs leading-snug text-background shadow-md"
        >
          {label}
        </span>
      )}
    </span>
  );
}
