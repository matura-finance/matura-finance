/// A tiny shared checklist for the read-only deploy scripts (preflight / check-deployment / verify).
/// Standardizes the `[ok] / [FAIL] / [warn]` line formatting and accumulates the failing labels so a
/// script can throw one aggregated error at the end. `check` records a hard pass/fail; `warn` prints
/// a non-fatal note (a condition expected to vary with seed state, not a deployment-integrity
/// violation) and never touches `failures`.
export interface Checklist {
  /// Record a hard pass/fail. A `false` pushes `label` onto `failures`.
  readonly check: (label: string, ok: boolean) => void;
  /// Print a non-fatal note. Never affects `failures`.
  readonly warn: (label: string) => void;
  /// The labels of every failed `check`, in order — read after all checks to build the exit error.
  readonly failures: readonly string[];
}

export function createChecklist(): Checklist {
  const failures: string[] = [];
  return {
    failures,
    check(label: string, ok: boolean): void {
      if (!ok) failures.push(label);
      console.log(`  [${ok ? "ok" : "FAIL"}] ${label}`);
    },
    warn(label: string): void {
      console.log(`  [warn] ${label}`);
    },
  };
}
