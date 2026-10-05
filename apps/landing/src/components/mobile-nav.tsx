"use client";

import { buttonVariants } from "@matura/ui/components/button";
import { cn } from "@matura/ui/lib/utils";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { APP_URL, NAV_LINKS } from "../lib/site";

/**
 * The ONLY client island on the marketing site: the mobile navigation toggle
 * plus its slide-down panel. Everything else renders as a server component.
 *
 * Accessibility: `aria-expanded` on the toggle, closes on link activation and
 * Esc, and traps focus within the open panel.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // Esc to close + focus trap while open.
  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    // Close on a tap/click outside the panel and its toggle.
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || toggleRef.current?.contains(target)) return;
      setOpen(false);
    }

    // Lock background scroll while the panel is open (it's absolute, so the page
    // would otherwise scroll the open-but-offscreen menu away under trapped focus).
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={toggleRef}
        type="button"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-midnight/15 text-midnight transition-colors hover:bg-midnight/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? (
            <>
              <line x1="4" y1="4" x2="16" y2="16" />
              <line x1="16" y1="4" x2="4" y2="16" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="17" y2="6" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="14" x2="17" y2="14" />
            </>
          )}
        </svg>
      </button>

      {open ? (
        <div
          id={panelId}
          ref={panelRef}
          className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-midnight/10 bg-mist/95 p-2 shadow-lg shadow-midnight/5 backdrop-blur-xl"
        >
          <nav aria-label="Mobile" className="flex w-full flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={close}
                className="rounded-md px-3 py-3 text-base font-medium capitalize text-midnight transition-colors hover:bg-midnight/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {link.label}
              </a>
            ))}
            <a
              href={APP_URL}
              onClick={close}
              className={cn(buttonVariants({ size: "lg" }), "mt-3 w-full")}
            >
              Open Matura
            </a>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
