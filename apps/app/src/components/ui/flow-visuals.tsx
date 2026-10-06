import type { ReactNode } from "react";

/**
 * Shared presentational pieces for the step-by-step flow dialogs (Get Liquidity, Issuer
 * create/settle/delay): a centered status pane, a vertical step checklist, and the three
 * status glyphs. Pure, stateless — the owning dialog drives which one renders.
 */

/** Centered icon + title + optional body + actions. Used for waiting/success/failure states. */
export function StatusPane({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      {icon}
      <p className="font-heading text-lg font-semibold text-foreground">{title}</p>
      {body !== undefined && <p className="max-w-sm text-sm text-muted-foreground">{body}</p>}
      {children}
    </div>
  );
}

/**
 * Vertical checklist of the steps in an action. Steps before `current` render done (✓), the one
 * at `current` is active (spinner), later ones are pending. If `failedAt` is set, that step shows
 * an error glyph and the rest stay pending.
 */
export function StepList({
  steps,
  current,
  failedAt,
}: {
  steps: string[];
  current: number;
  failedAt?: number;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((label, i) => {
        const failed = failedAt === i;
        const done = failedAt === undefined && i < current;
        const active = failedAt === undefined && i === current;
        return (
          <li key={label} className="flex items-center gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center">
              {failed ? (
                <MiniFail />
              ) : done ? (
                <MiniCheck />
              ) : active ? (
                <Spinner size={18} />
              ) : (
                <span className="size-2.5 rounded-full border border-border" aria-hidden />
              )}
            </span>
            <span
              className={`text-sm ${
                active || done ? "font-medium text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Horizontal step bar with connecting lines, full-width. Done steps show ✓, the current is ringed. */
export function StepBar({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="flex items-center">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const last = i === steps.length - 1;
        return (
          <li key={label} className={`flex items-center ${last ? "" : "flex-1"}`}>
            <div className="flex items-center gap-2">
              <span
                aria-current={active ? "step" : undefined}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "border-2 border-primary text-primary"
                      : "border border-border text-muted-foreground"
                }`}
              >
                {done ? "✓" : String(i + 1)}
              </span>
              <span
                className={`hidden whitespace-nowrap text-xs font-medium sm:inline ${
                  done || active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
            {!last && (
              <span
                aria-hidden
                className={`mx-2 h-px flex-1 ${done ? "bg-primary" : "bg-border"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function Spinner({ size = 32 }: { size?: number }) {
  return (
    <svg
      className="animate-spin text-primary"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

export function SuccessIcon() {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

export function FailIcon() {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </span>
  );
}

function MiniCheck() {
  return (
    <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

function MiniFail() {
  return (
    <span className="flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </span>
  );
}
