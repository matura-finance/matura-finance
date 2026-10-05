"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Minimal modal dialog: a portal to <body> with a dim+blur backdrop and a centered panel. Locks
 * body scroll while open. Dismiss (backdrop click / Escape) is gated by `dismissable` so an
 * in-flight transaction can't be closed out from under the user.
 */
export function Dialog({
  open,
  onClose,
  dismissable = true,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  dismissable?: boolean;
  size?: "md" | "lg";
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && dismissable) onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose, dismissable]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={() => {
          if (dismissable) onClose();
        }}
        className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-card border border-border bg-background p-6 shadow-lg ${
          size === "lg" ? "max-w-2xl" : "max-w-lg"
        }`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
