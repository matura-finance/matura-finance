"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Minimal modal dialog: a portal to <body> with a dim+blur backdrop and a centered panel. Locks
 * body scroll while open and traps focus within the panel (Tab/Shift+Tab wrap; initial focus moves
 * in; prior focus is restored on close). Dismiss (backdrop click / Escape) is gated by `dismissable`
 * so an in-flight transaction can't be closed out from under the user.
 */
export function Dialog({
  open,
  onClose,
  dismissable = true,
  size = "md",
  label = "Dialog",
  children,
}: {
  open: boolean;
  onClose: () => void;
  dismissable?: boolean;
  size?: "md" | "lg" | "xl" | "2xl";
  /** Accessible name for the modal (aria-label). */
  label?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (dismissable) onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (panel === null) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusables.at(0);
      const last = focusables.at(-1);
      if (first === undefined || last === undefined) {
        // Nothing focusable inside — keep focus on the panel rather than escaping to the backdrop.
        event.preventDefault();
        panel.focus();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the panel so keyboard/AT users start inside the modal, not on the page behind.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      previouslyFocused?.focus();
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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-card border border-border bg-background p-6 shadow-lg outline-none ${
          size === "2xl"
            ? "max-w-5xl"
            : size === "xl"
              ? "max-w-4xl"
              : size === "lg"
                ? "max-w-2xl"
                : "max-w-lg"
        }`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
