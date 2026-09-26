import { cloneElement, isValidElement, type ReactNode } from "react";

import { cn } from "../lib/utils";
import { Label } from "./label";

/** Subset of control props Field injects for accessible wiring. */
type ControlAria = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export interface FieldProps {
  /** Visible label text (or node) for the control. */
  label: ReactNode;
  /** `id` of the control; also drives the derived hint/error ids. */
  htmlFor: string;
  /** Error message. When set, marks the control invalid and gets `role="alert"`. */
  error?: string;
  /** Optional helper text shown below the control. */
  hint?: string;
  /** The control element (e.g. `<Input />`). */
  children: ReactNode;
  className?: string;
}

/**
 * Accessible form-field wrapper: composes a {@link Label}, a control slot, and
 * optional hint/error text. The control is wired to its hint/error via
 * `aria-describedby`, and the error node carries `role="alert"` so assistive
 * tech announces it. Widths/values are the caller's concern — Field only wires.
 */
export function Field({ label, htmlFor, error, hint, children, className }: FieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  const control = isValidElement<ControlAria>(children)
    ? cloneElement(children, {
        id: children.props.id ?? htmlFor,
        "aria-describedby":
          [children.props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") ||
          undefined,
        "aria-invalid": error ? true : children.props["aria-invalid"],
      })
    : children;

  return (
    <div data-slot="field" className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {control}
      {hint ? (
        <p id={hintId} data-slot="field-hint" className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" data-slot="field-error" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
