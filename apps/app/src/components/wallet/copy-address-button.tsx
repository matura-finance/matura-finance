"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Copies an address to the clipboard and briefly flips to a check mark. Reused by the wallet
 * popover and the Portfolio header.
 */
export function CopyAddressButton({ address, size = 15 }: { address: string; size?: number }) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetRef.current !== null) clearTimeout(resetRef.current);
    },
    [],
  );

  return (
    <button
      type="button"
      aria-label={copied ? "Address copied" : "Copy address"}
      title={copied ? "Copied" : "Copy address"}
      onClick={() => {
        void navigator.clipboard.writeText(address);
        setCopied(true);
        if (resetRef.current !== null) clearTimeout(resetRef.current);
        resetRef.current = setTimeout(() => {
          setCopied(false);
        }, 1500);
      }}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {copied ? <CheckIcon size={size} /> : <CopyIcon size={size} />}
    </button>
  );
}

/** Copy glyph (lucide "copy"). */
function CopyIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width={14} height={14} x={8} y={8} rx={2} ry={2} />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

/** Check glyph (lucide "check") — shown briefly after a successful copy. */
function CheckIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-primary"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
