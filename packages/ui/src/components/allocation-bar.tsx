import { cn } from "../lib/utils";

export interface AllocationSegment {
  /** Stable React key + screen-reader list key. */
  key: string;
  /** Short label rendered inside the segment and in the SR list. */
  label: string;
  /** Pre-computed width as a percentage (0–100). No math happens here. */
  widthPct: number;
  /** CSS custom property name for the fill, e.g. `"--color-vault-1"`. */
  colorVar: string;
  /** Optional detail surfaced only to screen readers. */
  sublabel?: string;
}

export interface AllocationRetained {
  /** Pre-computed width as a percentage (0–100). */
  widthPct: number;
  /** Label rendered inside the (always-hatched) retained segment. */
  label: string;
}

export interface AllocationBarProps {
  segments: AllocationSegment[];
  retained?: AllocationRetained;
  className?: string;
}

/**
 * Diagonal hatch layered over the neutral `--color-retained` fill. The hatch is
 * a colorblind-safe second channel so "You retain" never relies on hue alone.
 */
const RETAINED_HATCH =
  "repeating-linear-gradient(45deg, transparent 0 6px, rgba(255, 255, 255, 0.35) 6px 8px), var(--color-retained)";

/**
 * Purely presentational allocation bar. Widths arrive already computed; this
 * component only paints them. The bar is a single `role="img"` with a composed
 * `aria-label`, and a visually-hidden `<ul>` carries per-segment label/sublabel
 * text as the accessible (and colorblind-safe) fallback channel.
 */
export function AllocationBar({ segments, retained, className }: AllocationBarProps) {
  const summary = [
    ...segments.map((segment) => `${segment.label} ${String(segment.widthPct)}%`),
    retained ? `${retained.label} ${String(retained.widthPct)}%` : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div data-slot="allocation-bar" className={cn("w-full", className)}>
      <div
        role="img"
        aria-label={`Allocation: ${summary}`}
        className="flex h-8 w-full gap-0.5 overflow-hidden rounded"
      >
        {segments.map((segment) => (
          <div
            key={segment.key}
            aria-hidden="true"
            className="flex min-w-0 items-center overflow-hidden px-2 motion-reduce:transition-none"
            style={{
              width: `${String(segment.widthPct)}%`,
              background: `var(${segment.colorVar})`,
            }}
          >
            <span className="truncate text-xs font-medium text-midnight">{segment.label}</span>
          </div>
        ))}
        {retained ? (
          <div
            aria-hidden="true"
            className="flex min-w-0 items-center overflow-hidden px-2 motion-reduce:transition-none"
            style={{ width: `${String(retained.widthPct)}%`, background: RETAINED_HATCH }}
          >
            <span className="truncate text-xs font-medium text-midnight">{retained.label}</span>
          </div>
        ) : null}
      </div>
      <ul className="sr-only">
        {segments.map((segment) => (
          <li key={segment.key}>
            {segment.sublabel ? `${segment.label}: ${segment.sublabel}` : segment.label}
          </li>
        ))}
        {retained ? <li>{retained.label}</li> : null}
      </ul>
    </div>
  );
}
